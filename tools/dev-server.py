#!/usr/bin/env python3
"""送 no-store 的靜態伺服器（開發用）。

為什麼不直接用 `python3 -m http.server`：它不送任何 Cache-Control，瀏覽器會
用啟發式快取把 ES module 留著 —— 於是「改了檔案、重新載入頁面」拿到的還是舊模組。
實測踩過：save.js 的修正明明在磁碟上，瀏覽器裡 `save.recordPerfRun` 仍是 undefined，
而 `main.js`（同一次載入）卻是新版，因為它比較晚被快取。

用法：python3 tools/dev-server.py [port]     （預設 8899，綁 127.0.0.1）
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # 安靜一點，免得洗掉工具輸出


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    with ThreadingHTTPServer(('127.0.0.1', port), NoStoreHandler) as httpd:
        print(f'dev-server: http://127.0.0.1:{port}/ (no-store)', flush=True)
        httpd.serve_forever()
