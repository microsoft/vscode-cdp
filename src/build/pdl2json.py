import json
import os.path
import sys

# To use this, download and copy pdl.py from here beside this file
# https://github.com/nodejs/node/blob/e31a99f01b8a92615ce79b845441949424cd1dda/tools/inspector_protocol/pdl.py
import pdl

inspector_pdl_url = "https://raw.githubusercontent.com/nodejs/node/master/src/inspector/node_protocol.pdl"
pdl_contents = pdl.loads(sys.stdin.read(), "protocol.pdl", True)
json.dump(pdl_contents, sys.stdout, indent=2, separators=(",", ": "))
