# 地面貼圖：縮到 1024×1024 並做成無縫拼接（遊戲會把它重複鋪滿整張地圖）。
# 用法：python3 tools/make_ground_tile.py <來源圖> <輸出，如 assets/ground/ground_td_redalert.png>
#
# 生成的圖常常「看起來」可拼接、實際接縫還是會跳（實測紅警雪原上下接縫比圖內 96% 的相鄰列都大，
# 鋪開來會看到一條線）。做法：把圖錯位半張（np.roll）得到一張「邊界必然連續」的副本，
# 靠近邊界的地方用副本、中間用原圖，中間平滑過渡 —— 邊界一定接得上，原圖的主體保留。
import sys
import numpy as np
from PIL import Image

SIZE = 1024
BAND = 0.22   # 從邊界往內這個比例的範圍內漸變到原圖
# 副本的錯位比例。不用 1/2：生成器的「2×2 重複」圖在正中央有一條拼接線，錯位半張會把那條線
# 剛好搬到新磚的邊界上（實測墓園左右接縫混接後仍在 97%）。0.37 讓新邊界落在一般的內部位置，
# 而副本自己的接縫（原圖的邊）落在 [BAND, 1-BAND] 之間、完全被原圖蓋住
SHIFT = 0.37


def tileable(a):
    h, w = a.shape[:2]
    shifted = np.roll(a, (int(h * SHIFT), int(w * SHIFT)), axis=(0, 1))
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * BAND)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * BAND)
    wt = np.clip(np.minimum.outer(y, x), 0, 1)
    wt = wt * wt * (3 - 2 * wt)   # smoothstep：過渡不留硬邊
    return a * wt[..., None] + shifted * (1 - wt[..., None])


# 接縫在「圖內相鄰兩欄（列）差」的分布裡排第幾 %：單看某兩欄的差沒意義（剛好有履帶邊緣經過就很大），
# 要跟整張圖自己的分布比。落在 ~90% 以內就看不出接縫
def seams(a):
    d = lambda p, q: float(np.abs(p - q).mean())
    col = np.array([d(a[:, i], a[:, i + 1]) for i in range(a.shape[1] - 1)])
    row = np.array([d(a[i], a[i + 1]) for i in range(a.shape[0] - 1)])
    return np.mean(col < d(a[:, 0], a[:, -1])) * 100, np.mean(row < d(a[0], a[-1])) * 100


def load(img):
    a = np.array(img.resize((SIZE, SIZE), Image.LANCZOS)).astype(float)
    # 接縫已經在正常範圍就不混：混接會在邊界帶留下淡淡的重影
    if max(seams(a)) <= 90:
        return '整張縮小', a, a
    return '整張縮小＋邊界混接', a, tileable(a)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    how, a, t = load(Image.open(src).convert('RGB'))
    before, after = seams(a), seams(t)
    Image.fromarray(np.clip(t, 0, 255).astype(np.uint8)).save(out, optimize=True)
    print(f'{out}（{how}）：接縫在圖內相鄰差的百分位 左右 {before[0]:.0f}%→{after[0]:.0f}%、上下 {before[1]:.0f}%→{after[1]:.0f}%（~90% 以內看不出）')
