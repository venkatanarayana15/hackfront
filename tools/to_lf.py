import sys
for p in sys.argv[1:]:
    s = open(p, encoding='utf-8', newline='').read()
    n = s.replace('\r\n', '\n')
    open(p, 'w', encoding='utf-8', newline='').write(n)
    print(p, 'LF', len(n))
