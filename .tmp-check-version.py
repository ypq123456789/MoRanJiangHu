import urllib.request
import json

try:
    resp = urllib.request.urlopen('https://msjh.bacon.de5.net/release.config.json')
    data = json.loads(resp.read())
    print(f"自定义域名版本: {data.get('versionName', 'unknown')}")
except Exception as e:
    print(f"错误: {e}")

try:
    resp2 = urllib.request.urlopen('https://moranjianghu.648558021.workers.dev/release.config.json')
    data2 = json.loads(resp2.read())
    print(f"Worker 域名版本: {data2.get('versionName', 'unknown')}")
except Exception as e:
    print(f"错误: {e}")
