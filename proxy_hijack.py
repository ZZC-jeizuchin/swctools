import socket
import threading
import re

TARGET_DOMAIN = b"ailearn.seewo.com"
JUMP_PAGE = b"""HTTP/1.1 200 OK\r
Content-Type: text/html\r
Connection: close\r
\r
<!DOCTYPE html>
<html>
<head><title>AI Learn</title></head>
<body>
<script>location.replace('https://swctools.pages.dev/index.html')</script>
</body>
</html>
"""

def handle_client(client_sock):
    try:
        data = client_sock.recv(4096)
        if not data:
            client_sock.close()
            return
        
        # 提取目标域名（HTTPS CONNECT 或 HTTP Host 头）
        first_line = data.split(b"\r\n")[0]
        host = b""
        
        if first_line.startswith(b"CONNECT"):
            # HTTPS 请求：CONNECT ailearn.seewo.com:443
            host = first_line.split(b" ")[1].split(b":")[0]
        else:
            # HTTP 请求：GET / HTTP/1.1, Host: ailearn.seewo.com
            host_match = re.search(rb"Host: (.+?)\r\n", data)
            if host_match:
                host = host_match.group(1).split(b":")[0]
        
        if host == TARGET_DOMAIN:
            # 劫持：返回跳转页面
            if first_line.startswith(b"CONNECT"):
                # HTTPS 劫持：先建立隧道，再返回伪造响应
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                client_sock.recv(4096)  # 接收真正的 HTTPS 请求（但丢弃）
            client_sock.send(JUMP_PAGE)
            client_sock.close()
        else:
            # 正常转发
            remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            remote_sock.settimeout(10)
            
            # 从请求中解析目标 IP 和端口
            if first_line.startswith(b"CONNECT"):
                port = 443
            else:
                port = 80
            
            remote_sock.connect((host.decode(), port))
            
            if first_line.startswith(b"CONNECT"):
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:
                remote_sock.send(data)
            
            # 双向转发
            def forward(src, dst):
                try:
                    while True:
                        buf = src.recv(4096)
                        if not buf:
                            break
                        dst.send(buf)
                except:
                    pass
                finally:
                    src.close()
                    dst.close()
            
            threading.Thread(target=forward, args=(client_sock, remote_sock)).start()
            threading.Thread(target=forward, args=(remote_sock, client_sock)).start()
    except Exception as e:
        print(f"Error: {e}")
        client_sock.close()

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", 8080))
    server.listen(50)
    print("Proxy running on port 8080...")
    
    while True:
        client, addr = server.accept()
        print(f"Connection from {addr}")
        threading.Thread(target=handle_client, args=(client,)).start()

if __name__ == "__main__":
    main()