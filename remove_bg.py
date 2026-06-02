from PIL import Image
import collections

def remove_background(img_path, output_path):
    img = Image.open(img_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    visited = set()
    queue = collections.deque()
    
    # Add the 4 corners as starting points
    corners = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1)
    ]
    for c in corners:
        queue.append(c)
        visited.add(c)
        
    def is_bg_color(r, g, b, a):
        # Already transparent
        if a == 0:
            return True
        # Check if it's a light greyscale pixel (like the white/grey grid)
        if max(r, g, b) - min(r, g, b) <= 15 and r >= 160:
            return True
        return False

    while queue:
        x, y = queue.popleft()
        r, g, b, a = pixels[x, y]
        
        if is_bg_color(r, g, b, a):
            # Make it fully transparent
            pixels[x, y] = (r, g, b, 0)
            
            # Check 4-way neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in visited:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
                        
    img.save(output_path, "PNG")
    print("Background removed successfully!")

if __name__ == "__main__":
    remove_background("public/messi.png", "public/messi.png")
