import qrcode
from qrcode.constants import ERROR_CORRECT_H

targets = {
    "menu": "https://bugraerdn6.github.io/thepoint-corlu/",
    "instagram": "https://www.instagram.com/thepoint.corlu",
    "google-yorum": "https://share.google/JkHGgK2PrpbeEOBc0",
}

for name, url in targets.items():
    qr = qrcode.QRCode(
        error_correction=ERROR_CORRECT_H,
        box_size=20,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#14100d", back_color="#ffffff")
    img.save(f"{name}.png")
    print(f"saved {name}.png -> {url}")
