"""Make the print QR code for the shirt.

    pip install segno
    python3 tools/make_qr.py https://your-domain.example/shirt

Writes qr.svg (vector, for the printer) and qr.png (for checking on screen).
Uses high error correction so the code survives fabric texture and wear.
"""
import sys

try:
    import segno
except ImportError:
    sys.exit("Install segno first:  pip install segno")

if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
    sys.exit("Usage: python3 tools/make_qr.py https://your-domain.example/shirt")

url = sys.argv[1]
qr = segno.make(url, error="h", micro=False)
qr.save("qr.svg", scale=10, border=4, dark="#231F20", light="#FFFFFF")
qr.save("qr.png", scale=20, border=4, dark="#231F20", light="#FFFFFF")
print(f"QR version {qr.version} ({qr.symbol_size(border=0)[0]} modules) for {url}")
print("Wrote qr.svg and qr.png. Print at least 3 cm wide; test-scan the printed sample.")
if len(url) > 40:
    print("Tip: a shorter URL makes a simpler, more scannable code.")
