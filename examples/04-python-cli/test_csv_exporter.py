import os, tempfile, pytest
from csv_exporter import export_csv

def test_export_preserves_chinese():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = os.path.join(tmpdir, 'output.csv')
        export_csv('sample_data.json', out)
        with open(out, encoding='utf-8') as f:
            content = f.read()
        assert '张三' in content, f"Chinese characters garbled: {content[:200]}"
        assert '北京' in content
        assert '上海' in content

def test_export_row_count():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = os.path.join(tmpdir, 'output.csv')
        export_csv('sample_data.json', out)
        with open(out, encoding='utf-8') as f:
            lines = f.readlines()
        assert len(lines) == 4  # header + 3 data rows
