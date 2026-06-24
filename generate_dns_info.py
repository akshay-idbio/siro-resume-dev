import socket
import requests
from datetime import datetime


# ==========================
# CHANGE THESE VALUES
# ==========================
SERVER_IP = "216.48.179.15"
APP_PORT = 3001

# Example:
# If you want main domain: yourcompany.com
DOMAIN_NAME = "yourdomain.com"

# If you want subdomain like resume.yourdomain.com
SUBDOMAIN = "resume"   # keep "" if using main domain


def check_port(ip, port, timeout=5):
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)
        sock.close()
        return True
    except Exception:
        return False


def check_http(ip, port):
    url = f"http://{ip}:{port}"
    try:
        response = requests.get(url, timeout=10)
        return True, response.status_code
    except Exception as e:
        return False, str(e)


def generate_dns_info():
    print("=" * 70)
    print("RESUME APP DNS / GODADDY SETUP DETAILS")
    print("=" * 70)
    print(f"Generated At        : {datetime.now()}")
    print(f"Server IP           : {SERVER_IP}")
    print(f"Application Port    : {APP_PORT}")
    print(f"Current App URL      : http://{SERVER_IP}:{APP_PORT}")
    print()

    if SUBDOMAIN:
        final_domain = f"{SUBDOMAIN}.{DOMAIN_NAME}"
        host_value = SUBDOMAIN
    else:
        final_domain = DOMAIN_NAME
        host_value = "@"

    print("=" * 70)
    print("DOMAIN TO BE CONFIGURED")
    print("=" * 70)
    print(f"Final Website URL    : http://{final_domain}")
    print()

    print("=" * 70)
    print("GODADDY DNS ENTRY REQUIRED")
    print("=" * 70)
    print("Record Type          : A")
    print(f"Name / Host          : {host_value}")
    print(f"Value / Points To    : {SERVER_IP}")
    print("TTL                  : Default / 600 seconds / 1 hour")
    print()

    print("=" * 70)
    print("OPTIONAL WWW RECORD")
    print("=" * 70)
    print("If you also want www version:")
    print()
    print("Record Type          : CNAME")
    print("Name / Host          : www")
    print(f"Value / Points To    : {final_domain}")
    print("TTL                  : Default")
    print()

    print("=" * 70)
    print("SERVER CHECK")
    print("=" * 70)

    port_open = check_port(SERVER_IP, APP_PORT)
    print(f"Port {APP_PORT} Open      : {'YES' if port_open else 'NO'}")

    http_ok, http_result = check_http(SERVER_IP, APP_PORT)
    print(f"HTTP App Running     : {'YES' if http_ok else 'NO'}")
    print(f"HTTP Result          : {http_result}")
    print()

    print("=" * 70)
    print("IMPORTANT NOTE")
    print("=" * 70)
    print("DNS can point domain to IP only.")
    print("DNS cannot point directly to port 3001.")
    print()
    print("So after adding DNS, you must configure Nginx reverse proxy:")
    print(f"http://{final_domain}  --->  http://{SERVER_IP}:{APP_PORT}")
    print()
    print("Without Nginx, user may need to open:")
    print(f"http://{final_domain}:{APP_PORT}")
    print()
    print("Recommended final setup:")
    print(f"http://{final_domain}")
    print("=" * 70)


if __name__ == "__main__":
    generate_dns_info()