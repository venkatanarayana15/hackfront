from pptx import Presentation
p = Presentation('docs/CodeCompass-hackFront-India.pptx')
for i, s in enumerate(p.slides, 1):
    print(f'\n===== SLIDE {i} =====')
    for sh in s.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            t = sh.text_frame.text.strip().replace('\n', ' / ')
            print(' ', t[:220])
