package captcha

import (
	"embed"
	"fmt"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/font/sfnt"
)

//go:embed assets/NotoSansSC-captcha-subset.otf
var assetFS embed.FS

var (
	parsedFont     *sfnt.Font
	parsedFontErr  error
	parsedFontOnce sync.Once

	faceCache   = map[int]font.Face{}
	faceCacheMu sync.Mutex
)

func loadFont() (*sfnt.Font, error) {
	parsedFontOnce.Do(func() {
		data, err := assetFS.ReadFile("assets/NotoSansSC-captcha-subset.otf")
		if err != nil {
			parsedFontErr = err
			return
		}
		parsedFont, parsedFontErr = opentype.Parse(data)
	})
	return parsedFont, parsedFontErr
}

// faceForSize returns a face for the given pixel size. Faces are cached because
// each opentype.NewFace allocates a rasterizer, and a challenge draws several
// glyphs at a handful of sizes.
//
// DPI is fixed at 72 so Size is literally pixels; any other value silently
// rescales the glyphs and the recorded hit boxes stop matching the drawn ink.
func faceForSize(sizePx int) (font.Face, error) {
	f, err := loadFont()
	if err != nil {
		return nil, err
	}

	faceCacheMu.Lock()
	defer faceCacheMu.Unlock()
	if face, ok := faceCache[sizePx]; ok {
		return face, nil
	}
	face, err := opentype.NewFace(f, &opentype.FaceOptions{
		Size:    float64(sizePx),
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return nil, err
	}
	faceCache[sizePx] = face
	return face, nil
}

// missingPoolGlyphs reports pool characters the bundled font cannot draw.
// sfnt reports an absent rune as glyph index 0 without an error, which would
// silently produce an unsolvable challenge, so this is asserted by a test.
func missingPoolGlyphs() ([]rune, error) {
	f, err := loadFont()
	if err != nil {
		return nil, err
	}
	var buf sfnt.Buffer
	var missing []rune
	for _, r := range poolRunes {
		idx, err := f.GlyphIndex(&buf, r)
		if err != nil {
			return nil, fmt.Errorf("glyph lookup failed for %q: %w", r, err)
		}
		if idx == 0 {
			missing = append(missing, r)
		}
	}
	return missing, nil
}
