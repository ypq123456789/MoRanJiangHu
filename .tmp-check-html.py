import urllib.request
import re

def check_version(url, name):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req)
        html = resp.read().decode('utf-8')
        
        # 查找版本信息
        version_match = re.search(r'"versionName"\s*:\s*"([^"]+)"', html)
        if version_match:
            print(f"{name}: 版本 {version_match.group(1)}")
        else:
            # 尝试查找其他版本标记
            print(f"{name}: 未找到版本信息")
            if len(html) < 500:
                print(f"  HTML 内容: {html[:200]}")
    except Exception as e:
        print(f"{name}: 错误 - {e}")

check_version('https://msjh.bacon.de5.net/', '自定义域名')
check_version('https://moranjianghu.648558021.workers.dev/', 'Worker 域名')
