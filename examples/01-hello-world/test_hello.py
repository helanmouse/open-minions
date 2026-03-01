import subprocess
import sys


def test_hello_output():
    """Test that hello.py prints the expected output."""
    result = subprocess.run(
        [sys.executable, 'hello.py'],
        capture_output=True,
        text=True,
        cwd='.'
    )
    
    assert result.returncode == 0, f"Script failed with: {result.stderr}"
    assert 'Hello from Minion!' in result.stdout, f"Expected 'Hello from Minion!' but got: {result.stdout}"
