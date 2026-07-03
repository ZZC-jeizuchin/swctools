import socket, threading, re

TARGET_DOMAIN = b"ailearn.seewo.com"
MY_SERVER_IP = "154.40.44.14"   # 你自己的服务器 IP
PROXY_PORT = 8081

def forward(src, dst):
    """双向转发数据"""
    try:
        while True:
            buf = src.recv(4096)
            if not buf:
                break
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

        # 解析目标主机
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
            # 劫持目标域名
            if first_line.startswith(b"CONNECT"):
                # HTTPS：连接到我们自己的服务器
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                remote_sock.connect((MY_SERVER_IP, 443))
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:
                # HTTP：直接返回跳转页
                jump_page = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<script>location.replace('https://swctools.pages.dev/index.html')</script>"
                client_sock.send(jump_page)
                client_sock.close()
                return
        else:
            # 其他域名：透明代理
            if first_line.startswith(b"CONNECT"):
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                remote_sock.connect((host.decode(), 443))
                client_sock.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:
                remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote_sock.settimeout(10)
                remote_sock.connect((host.decode(), 80))
                remote_sock.send(data)

        # 双向转发（对于所有情况，除了 HTTP 直接返回）
        if 'remote_sock' in locals():
            t1 = threading.Thread(target=forward, args=(client_sock, remote_sock), daemon=True)
            t2 = threading.Thread(target=forward, args=(remote_sock, client_sock), daemon=True)
            t1.start()
            t2.start()
            # 不等待线程结束，让它们后台运行
    except Exception as e:
        print(f"Error: {e}")
        try:
            client_sock.close()
        except:
            pass

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", PROXY_PORT))
    server.listen(50)
    print(f"Proxy running on port {PROXY_PORT}, forwarding {TARGET_DOMAIN.decode()} to {MY_SERVER_IP}:443")
    while True:
        client, addr = server.accept()
        threading.Thread(target=handle_client, args=(client,), daemon=True).start()

if __name__ == "__main__":
    main()