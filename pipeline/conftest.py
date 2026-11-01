import sys
from pathlib import Path

# Let tests import pipeline modules as top-level modules (airports, sun_geometry, ...).
sys.path.insert(0, str(Path(__file__).resolve().parent))
