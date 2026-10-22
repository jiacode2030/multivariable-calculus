"""Build the claude.ai artifact copy from index.html.
The artifact host adds its own <!doctype>/<head>/<body> wrapper, so strip ours.
Usage: python3 tools/to_artifact.py OUT.html"""
import pathlib, re, sys
src = (pathlib.Path(__file__).resolve().parent.parent / "index.html").read_text()
head_end = src.index("<title>")
out = src[head_end:]
out = out.replace("</title>\n", '</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n', 1)
out = out.replace("</head>\n<body>\n", "", 1)
out = re.sub(r"\n</body>\n</html>\n?$", "\n", out)
pathlib.Path(sys.argv[1]).write_text(out)
