import re, sys, io

txt = open('knowledge/ps.txt', encoding='utf-8-sig').read()
i = txt.find('PS T1.1')
j = txt.find('PS T1.2')
out = txt[i:j]
open('knowledge/ps-t1.1.txt', 'w', encoding='utf-8').write(out)
print(out)
