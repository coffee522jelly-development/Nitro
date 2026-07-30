import re

with open("nitro/src-tauri/src/lib.rs", "r") as f:
    content = f.read()

content = content.replace("app_name.replace(''', \"''\")", "app_name.replace(\"'\", \"''\")")

with open("nitro/src-tauri/src/lib.rs", "w") as f:
    f.write(content)
