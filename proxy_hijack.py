
import socket, threading, ssl, re, os

TARGET_DOMAIN = b"ailearn.seewo.com"
CERT_FILE = "/etc/nginx/ssl/seewo.crt"
KEY_FILE = "/etc/nginx/ssl/seewo.key"

JUMP_PAGE = b"""HTTP/1.1 200 OK\r
Content-Type: text/html\r
Connection: close\r
\r
<!DOCTYPE html>
<html><head><title>AI</title></head><body>
<script>location.replace('https://swctools.pages.dev/index.html')</script>
</body></html>
"""

def handle_client(client_sock):
    try:
        data = client_sock.recv(4096)
        if not data:
            client_sock.close(); return

        first_line = data.split(b"\r\n")[0]
        host = b""

        if first_line.startswith(b"CONNECT"):
            parts = first_line.split(b" ")
            if len(parts) > 1:
                host_port = parts[1].split(b":")
                host = host_port[0]
        else:
            match = re.search(rb"Host: (.+?)\r\n", data)
            if match:
                host = match.group(1).split(b":")[0]

        # 处理劫持域名
        if host == TARGET_DOMAIN:
            if first_line.startswith(b"CONNECT"):
                # 告诉平板隧道已建立
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                # 用自签证书把当前连接包装成加密连接
                if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
                    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    context.load_cert_chain(CERT_FILE, KEY_FILE)
                    tls_sock = context.wrap_socket(client_sock, server_side=True)
                else:
                    # 没有证书就直接明文（可能会失败）
                    tls_sock = client_sock
                # 在加密隧道里接收浏览器真正的请求（忽略内容）
                try:
                    tls_sock.recv(4096)
                except:
                    pass
                tls_sock.send(JUMP_PAGE)
                tls_sock.close()
            else:
                # HTTP 明文劫持
                client_sock.send(JUMP_PAGE)
                client_sock.close()
        else:
            # 其他域名：正常转发
            if first_line.startswith(b"CONNECT"):
                port = 443
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                try:
                    remote_sock.connect((host.decode(), port))
                except Exception as e:
                    client_sock.send(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    client_sock.close()
                    return
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:
                port = 80
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                try:
                    remote_sock.connect((host.decode(), port))
                except:
                    client_sock.send(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    client_sock.close()
                    return
                remote_sock.send(data)

            # 双向转发
            def forward(src, dst):
                try:
                    while True:
                        buf = src.recv(4096)
                        if not buf: break
                        dst.send(buf)
                except:
                    pass
                finally:
                    src.close()
                    dst.close()

            threading.Thread(target=forward, args=(client_sock, remote_sock), daemon=True).start()
            threading.Thread(target=forward, args=(remote_sock, client_sock), daemon=True).start()
    except Exception as e:
        print(f"Error: {e}")
        try: client_sock.close()
        except: pass

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", 8080))
    server.listen(50)
    print("Proxy (HTTPS ok) running on port 8080...")
    while True:
        client, addr = server.accept()
        threading.Thread(target=handle_client, args=(client,), daemon=True).start()

if __name__ == "__main__":
    main()
