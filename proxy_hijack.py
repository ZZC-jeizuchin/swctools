import socket, threading, re

TARGET_DOMAIN = b"ailearn.seewo.com"
REAL_SEEWO_IP = "101.37.44.92"
INJECT_SCRIPT = b"<script>location.replace('https://swctools.pages.dev/index.html')</script>"

def inject_html(data):
    """在 </head> 前注入跳转脚本"""
    return re.sub(b"</head>", INJECT_SCRIPT + b"</head>", data, count=1)

def forward(src, dst, inject=False):
    """双向转发，可选注入"""
    try:
        while True:
            buf = src.recv(4096)
            if not buf:
                break
            if inject:
                buf = inject_html(buf)
            dst.send(buf)
    except:
        pass
    finally:
        try:
            src.close()
        except:
            pass
        try:
            dst.close()
        except:
            pass

def handle_client(client_sock):
    try:
        data = client_sock.recv(4096)
        if not data:
            client_sock.close()
            return

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

        if host == TARGET_DOMAIN:
            if first_line.startswith(b"CONNECT"):
                # HTTPS：连接真正希沃服务器
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                remote_sock.connect((REAL_SEEWO_IP, 443))
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")

                # 双向转发（对响应注入脚本）
                t1 = threading.Thread(target=forward, args=(client_sock, remote_sock, False))
                t2 = threading.Thread(target=forward, args=(remote_sock, client_sock, True))
                t1.daemon = True
                t2.daemon = True
                t1.start()
                t2.start()
                t1.join()
                t2.join()
            else:
                # HTTP：直接返回跳转页
                client_sock.send(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<script>location.replace('https://swctools.pages.dev/index.html')</script>")
                client_sock.close()
        else:
            # 其他域名：正常转发
            if first_line.startswith(b"CONNECT"):
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                remote_sock.connect((host.decode(), 443))
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                threading.Thread(target=forward, args=(client_sock, remote_sock), daemon=True).start()
                threading.Thread(target=forward, args=(remote_sock, client_sock), daemon=True).start()
            else:
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                remote_sock.connect((host.decode(), 80))
                remote_sock.send(data)
                threading.Thread(target=forward, args=(client_sock, remote_sock), daemon=True).start()
                threading.Thread(target=forward, args=(remote_sock, client_sock), daemon=True).start()
    except Exception as e:
        print(f"Error: {e}")
        try:
            client_sock.close()
        except:
            pass

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", 8081))
    server.listen(50)
    print("Proxy (inject mode) running on port 8081...")
    while True:
        client, addr = server.accept()
        threading.Thread(target=handle_client, args=(client,), daemon=True).start()

if __name__ == "__main__":
    main()
