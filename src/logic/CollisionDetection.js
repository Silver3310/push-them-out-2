export function circleCircle(ax, ay, ar, bx, by, br) {
    return Math.hypot(bx - ax, by - ay) < ar + br;
}

export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx, rx + rw));
    const nearY = Math.max(ry, Math.min(cy, ry + rh));
    return Math.hypot(cx - nearX, cy - nearY) < cr;
}

export function pointInCircle(px, py, cx, cy, cr) {
    return Math.hypot(px - cx, py - cy) < cr;
}