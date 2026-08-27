package captcha

import (
	"image"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestFontCoversPool guards the one failure mode that produces an unsolvable
// captcha without any error: a pool character the bundled subset cannot draw.
// sfnt answers glyph index 0 for a missing rune, which rasterises to nothing.
func TestFontCoversPool(t *testing.T) {
	missing, err := missingPoolGlyphs()
	require.NoError(t, err)
	assert.Empty(t, missing, "regenerate the font subset: assets/regenerate-subset.sh")
}

func TestCharacterPoolHasNoDuplicates(t *testing.T) {
	seen := map[rune]bool{}
	for _, r := range poolRunes {
		require.False(t, seen[r], "character %q appears twice in the pool", r)
		seen[r] = true
	}
	// A puzzle draws glyphCount distinct characters; too small a pool would make
	// the picker loop forever.
	assert.Greater(t, len(poolRunes), glyphCount*4)
}

// inkRatio measures how much dark ink sits inside a box with the given full
// side length. Rendering tests have to assert on pixels: a blank box and a
// drawn glyph both "succeed" otherwise.
func inkRatio(img *image.RGBA, cx, cy, side int) float64 {
	half := side / 2
	dark, total := 0, 0
	for y := cy - half; y <= cy+half; y++ {
		for x := cx - half; x <= cx+half; x++ {
			if x < 0 || y < 0 || x >= imageWidth || y >= imageHeight {
				continue
			}
			c := img.RGBAAt(x, y)
			luminance := 0.299*float64(c.R) + 0.587*float64(c.G) + 0.114*float64(c.B)
			if luminance < 120 {
				dark++
			}
			total++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(dark) / float64(total)
}

func TestRenderedGlyphsActuallyHaveInk(t *testing.T) {
	rng, err := seededRand()
	require.NoError(t, err)

	img, spots, err := renderChallenge(rng)
	require.NoError(t, err)
	require.Len(t, spots, glyphCount)

	// Sample the background away from every glyph for a comparison baseline.
	background := 0.0
	samples := 0
	for x := 4; x < imageWidth; x += 17 {
		for y := 4; y < imageHeight; y += 13 {
			near := false
			for _, s := range spots {
				if abs(x-s.X) < s.Size && abs(y-s.Y) < s.Size {
					near = true
					break
				}
			}
			if near {
				continue
			}
			background += inkRatio(img, x, y, 3)
			samples++
		}
	}
	require.Greater(t, samples, 0)
	background /= float64(samples)

	for _, s := range spots {
		// Size is the recorded glyph hit-box size. Sampling only its inner half
		// misses perimeter strokes on hollow glyphs such as 门 and 口.
		ink := inkRatio(img, s.X, s.Y, s.Size)
		assert.Greater(t, ink, background+0.05,
			"glyph %q at (%d,%d) has almost no ink (%.4f vs background %.4f) — the font subset probably lacks it",
			s.Char, s.X, s.Y, ink, background)
	}
}

// TestGlyphsStayInsideImage catches clipped characters. Only glyph ink is drawn
// dark — the background gradient, curves and speckles all stay well above this
// luminance — so any dark pixel in the border frame means a glyph ran off the
// edge and may be unreadable.
func TestGlyphsStayInsideImage(t *testing.T) {
	for run := 0; run < 25; run++ {
		rng, err := seededRand()
		require.NoError(t, err)
		img, spots, err := renderChallenge(rng)
		require.NoError(t, err)

		for x := 0; x < imageWidth; x++ {
			for _, y := range []int{0, imageHeight - 1} {
				require.Greater(t, luminanceAt(img, x, y), 120.0,
					"ink touches the frame at (%d,%d); glyphs: %v", x, y, spots)
			}
		}
		for y := 0; y < imageHeight; y++ {
			for _, x := range []int{0, imageWidth - 1} {
				require.Greater(t, luminanceAt(img, x, y), 120.0,
					"ink touches the frame at (%d,%d); glyphs: %v", x, y, spots)
			}
		}
	}
}

func luminanceAt(img *image.RGBA, x, y int) float64 {
	c := img.RGBAAt(x, y)
	return 0.299*float64(c.R) + 0.587*float64(c.G) + 0.114*float64(c.B)
}

func TestGenerateProducesDistinctChallenges(t *testing.T) {
	first, err := Generate()
	require.NoError(t, err)
	second, err := Generate()
	require.NoError(t, err)

	assert.NotEqual(t, first.Id, second.Id)
	assert.NotEqual(t, first.Image, second.Image)
	assert.Len(t, first.Targets, targetCount)
	assert.Equal(t, imageWidth, first.Width)
	assert.Equal(t, imageHeight, first.Height)
}

func TestVerifyAcceptsClicksOnTargets(t *testing.T) {
	id, targets := issueChallengeForTest(t)

	clicks := make([]Point, 0, len(targets))
	for _, target := range targets {
		clicks = append(clicks, Point{X: target.X, Y: target.Y})
	}
	assert.True(t, Verify(id, clicks))
}

func TestVerifyRejectsWrongOrder(t *testing.T) {
	id, targets := issueChallengeForTest(t)

	clicks := []Point{
		{X: targets[1].X, Y: targets[1].Y},
		{X: targets[0].X, Y: targets[0].Y},
		{X: targets[2].X, Y: targets[2].Y},
	}
	// Swapped targets must be far enough apart for this to be a real assertion.
	require.Greater(t, abs(targets[0].X-targets[1].X)+abs(targets[0].Y-targets[1].Y), targets[0].Size)
	assert.False(t, Verify(id, clicks))
}

func TestVerifyRejectsClickOutsideTolerance(t *testing.T) {
	id, targets := issueChallengeForTest(t)

	clicks := make([]Point, 0, len(targets))
	for i, target := range targets {
		if i == 0 {
			clicks = append(clicks, Point{X: target.X + target.Size*2, Y: target.Y})
			continue
		}
		clicks = append(clicks, Point{X: target.X, Y: target.Y})
	}
	assert.False(t, Verify(id, clicks))
}

// A solved image must not be reusable, otherwise one human solve turns into
// unlimited automated submissions.
func TestVerifyConsumesChallengeOnSuccess(t *testing.T) {
	id, targets := issueChallengeForTest(t)

	clicks := make([]Point, 0, len(targets))
	for _, target := range targets {
		clicks = append(clicks, Point{X: target.X, Y: target.Y})
	}
	require.True(t, Verify(id, clicks))
	assert.False(t, Verify(id, clicks), "challenge was accepted twice")
}

// A wrong answer must burn the challenge too, so the same image cannot be used
// to search for the right spots.
func TestVerifyConsumesChallengeOnFailure(t *testing.T) {
	id, targets := issueChallengeForTest(t)

	wrong := []Point{{X: 0, Y: 0}, {X: 0, Y: 0}, {X: 0, Y: 0}}
	require.False(t, Verify(id, wrong))

	clicks := make([]Point, 0, len(targets))
	for _, target := range targets {
		clicks = append(clicks, Point{X: target.X, Y: target.Y})
	}
	assert.False(t, Verify(id, clicks), "challenge survived a failed attempt")
}

func TestVerifyRejectsUnknownIdAndWrongClickCount(t *testing.T) {
	assert.False(t, Verify("", []Point{{X: 1, Y: 1}, {X: 2, Y: 2}, {X: 3, Y: 3}}))
	assert.False(t, Verify("does-not-exist", []Point{{X: 1, Y: 1}, {X: 2, Y: 2}, {X: 3, Y: 3}}))

	id, targets := issueChallengeForTest(t)
	assert.False(t, Verify(id, []Point{{X: targets[0].X, Y: targets[0].Y}}))
}

// issueChallengeForTest returns a live challenge id together with its answer,
// which only test code inside the package can see.
func issueChallengeForTest(t *testing.T) (string, []glyphSpot) {
	t.Helper()

	challenge, err := Generate()
	require.NoError(t, err)

	memoryStoreMu.Lock()
	entry, ok := memoryStore[challenge.Id]
	memoryStoreMu.Unlock()
	require.True(t, ok, "challenge was not stored in memory; is Redis enabled in this test run?")
	require.Len(t, entry.Targets, targetCount)

	return challenge.Id, entry.Targets
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
