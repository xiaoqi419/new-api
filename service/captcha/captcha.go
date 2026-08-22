package captcha

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"image/png"
	"math"
	mathrand "math/rand/v2"

	"github.com/google/uuid"
)

// Point is a click position in image pixels, with the image's own top-left as
// the origin.
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Challenge is what the browser needs to render one puzzle. Where the targets
// actually are never leaves the server.
type Challenge struct {
	Id      string   `json:"id"`
	Image   string   `json:"image"` // data URL, PNG
	Targets []string `json:"targets"`
	Width   int      `json:"width"`
	Height  int      `json:"height"`
}

var ErrFontUnavailable = errors.New("captcha font unavailable")

// Generate draws a new puzzle and stores its answer for a single later check.
func Generate() (*Challenge, error) {
	if _, err := loadFont(); err != nil {
		return nil, ErrFontUnavailable
	}

	rng, err := seededRand()
	if err != nil {
		return nil, err
	}

	img, spots, err := renderChallenge(rng)
	if err != nil {
		return nil, err
	}

	// Ask for a subset in a random order, so the remaining glyphs act as
	// distractors and the prompt order cannot be guessed from the layout.
	order := rng.Perm(len(spots))[:targetCount]
	targets := make([]glyphSpot, 0, targetCount)
	labels := make([]string, 0, targetCount)
	for _, idx := range order {
		targets = append(targets, spots[idx])
		labels = append(labels, spots[idx].Char)
	}

	id := uuid.NewString()
	if err := saveChallenge(id, targets); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}

	return &Challenge{
		Id:      id,
		Image:   "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()),
		Targets: labels,
		Width:   imageWidth,
		Height:  imageHeight,
	}, nil
}

// Verify consumes the challenge and reports whether the clicks hit the prompted
// characters in the prompted order. A challenge is spent on the first attempt,
// right or wrong, so a wrong answer cannot be brute forced against one image.
func Verify(id string, clicks []Point) bool {
	if id == "" || len(clicks) != targetCount {
		return false
	}

	entry, ok := consumeChallenge(id)
	if !ok || len(entry.Targets) != targetCount {
		return false
	}

	for i, target := range entry.Targets {
		// Anti-aliasing and rotation soften the glyph edges, so accept anywhere
		// inside the glyph rather than demanding the exact centre.
		tolerance := float64(target.Size) * 0.65
		dx := float64(clicks[i].X - target.X)
		dy := float64(clicks[i].Y - target.Y)
		if math.Hypot(dx, dy) > tolerance {
			return false
		}
	}
	return true
}

// seededRand seeds math/rand/v2 from crypto/rand: a package-global generator
// seeded once would make challenge layouts predictable across a process.
func seededRand() (*mathrand.Rand, error) {
	var seed [16]byte
	if _, err := rand.Read(seed[:]); err != nil {
		return nil, err
	}
	return mathrand.New(mathrand.NewPCG(
		binary.LittleEndian.Uint64(seed[0:8]),
		binary.LittleEndian.Uint64(seed[8:16]),
	)), nil
}
