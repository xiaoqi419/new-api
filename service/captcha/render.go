package captcha

import (
	"image"
	"image/color"
	"math"
	"math/rand/v2"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/math/f64"
	"golang.org/x/image/math/fixed"
)

const (
	imageWidth  = 320
	imageHeight = 160

	glyphCount   = 5 // characters drawn on the image
	targetCount  = 3 // how many of them the user must click, in order
	minGlyphSize = 34
	maxGlyphSize = 44
	maxRotation  = 28.0 // degrees, either direction

	// placeAttempts bounds the rejection sampling. Without a cap an unlucky
	// seed can spin forever looking for a non-overlapping spot.
	placeAttempts = 400
)

type glyphSpot struct {
	Char string `json:"c"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
	Size int    `json:"s"`
}

// drawBackground paints a light gradient with sine curves and speckles. It stays
// deliberately light: the glyphs are drawn dark, so pushing the background down
// would hurt human readability more than it hurts a bot.
func drawBackground(img *image.RGBA, rng *rand.Rand) {
	baseR := 226 + rng.IntN(20)
	baseG := 232 + rng.IntN(16)
	baseB := 240 + rng.IntN(14)

	for y := 0; y < imageHeight; y++ {
		shade := int(float64(y) / float64(imageHeight) * 18)
		for x := 0; x < imageWidth; x++ {
			img.SetRGBA(x, y, color.RGBA{
				R: uint8(clampInt(baseR-shade, 0, 255)),
				G: uint8(clampInt(baseG-shade, 0, 255)),
				B: uint8(clampInt(baseB-shade, 0, 255)),
				A: 255,
			})
		}
	}

	for i := 0; i < 3; i++ {
		amp := 8.0 + rng.Float64()*14
		period := 60.0 + rng.Float64()*90
		offset := rng.Float64() * float64(imageHeight)
		phase := rng.Float64() * math.Pi * 2
		lineColor := color.RGBA{
			R: uint8(150 + rng.IntN(60)),
			G: uint8(160 + rng.IntN(60)),
			B: uint8(180 + rng.IntN(60)),
			A: 255,
		}
		for x := 0; x < imageWidth; x++ {
			y := int(offset + amp*math.Sin(float64(x)/period*math.Pi*2+phase))
			for dy := 0; dy < 2; dy++ {
				if y+dy >= 0 && y+dy < imageHeight {
					img.SetRGBA(x, y+dy, lineColor)
				}
			}
		}
	}

	for i := 0; i < 320; i++ {
		x := rng.IntN(imageWidth)
		y := rng.IntN(imageHeight)
		g := uint8(170 + rng.IntN(60))
		img.SetRGBA(x, y, color.RGBA{R: g, G: g, B: uint8(clampInt(int(g)+10, 0, 255)), A: 255})
	}
}

// drawGlyph renders one rune into its own tile and blits it rotated so that the
// ink lands centred on (centerX, centerY) — the coordinate the answer records.
func drawGlyph(dst *image.RGBA, face font.Face, r rune, centerX, centerY, sizePx int, angleDeg float64, ink color.RGBA) {
	// A rotated glyph needs slack in its tile or the corners get clipped.
	tile := int(float64(sizePx)*1.5) + 4
	tileImg := image.NewRGBA(image.Rect(0, 0, tile, tile))

	bounds, _, ok := face.GlyphBounds(r)
	if !ok {
		return
	}
	inkW := (bounds.Max.X - bounds.Min.X).Ceil()
	inkH := (bounds.Max.Y - bounds.Min.Y).Ceil()

	// Center on the ink box, not on the advance width or the font's ascent box:
	// CJK advances carry side bearings and the vertical box is much taller than
	// the ink, so a naive baseline placement would offset the glyph from the
	// recorded hit box.
	originX := (tile-inkW)/2 - bounds.Min.X.Floor()
	originY := (tile-inkH)/2 - bounds.Min.Y.Floor()

	drawer := &font.Drawer{
		Dst:  tileImg,
		Src:  image.NewUniform(ink),
		Face: face,
		Dot:  fixed.P(originX, originY),
	}
	drawer.DrawString(string(r))

	angle := angleDeg * math.Pi / 180
	sin, cos := math.Sin(angle), math.Cos(angle)
	half := float64(tile) / 2
	// Rotate about the tile centre, then move that centre onto the target point.
	m := f64.Aff3{
		cos, -sin, float64(centerX) - (cos*half - sin*half),
		sin, cos, float64(centerY) - (sin*half + cos*half),
	}
	xdraw.BiLinear.Transform(dst, m, tileImg, tileImg.Bounds(), xdraw.Over, nil)
}

// renderChallenge draws glyphCount characters and returns where each landed.
func renderChallenge(rng *rand.Rand) (*image.RGBA, []glyphSpot, error) {
	img := image.NewRGBA(image.Rect(0, 0, imageWidth, imageHeight))
	drawBackground(img, rng)

	chosen := make([]rune, 0, glyphCount)
	used := map[rune]bool{}
	for len(chosen) < glyphCount {
		r := poolRunes[rng.IntN(len(poolRunes))]
		if used[r] {
			continue
		}
		used[r] = true
		chosen = append(chosen, r)
	}

	spots := make([]glyphSpot, 0, glyphCount)
	for _, r := range chosen {
		sizePx := minGlyphSize + rng.IntN(maxGlyphSize-minGlyphSize+1)
		face, err := faceForSize(sizePx)
		if err != nil {
			return nil, nil, err
		}

		// Half the glyph is not enough slack: rotating a square box grows its
		// bounding radius to half the diagonal, so a glyph placed that close to
		// the edge gets a corner clipped (TestGlyphsStayInsideImage).
		margin := int(float64(sizePx)*0.78) + 3
		var cx, cy int
		placed := false
		spacing := sizePx + 6
		for attempt := 0; attempt < placeAttempts; attempt++ {
			// Relax the spacing rather than give up: a slightly tight layout is
			// still solvable, an error page is not.
			if attempt == placeAttempts/2 {
				spacing = sizePx
			}
			cx = margin + rng.IntN(imageWidth-2*margin)
			cy = margin + rng.IntN(imageHeight-2*margin)
			ok := true
			for _, s := range spots {
				dx := float64(cx - s.X)
				dy := float64(cy - s.Y)
				if math.Hypot(dx, dy) < float64(spacing) {
					ok = false
					break
				}
			}
			if ok {
				placed = true
				break
			}
		}
		if !placed {
			cx = margin + rng.IntN(imageWidth-2*margin)
			cy = margin + rng.IntN(imageHeight-2*margin)
		}

		ink := color.RGBA{
			R: uint8(20 + rng.IntN(60)),
			G: uint8(20 + rng.IntN(60)),
			B: uint8(40 + rng.IntN(70)),
			A: 255,
		}
		drawGlyph(img, face, r, cx, cy, sizePx, (rng.Float64()*2-1)*maxRotation, ink)
		spots = append(spots, glyphSpot{Char: string(r), X: cx, Y: cy, Size: sizePx})
	}

	return img, spots, nil
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
