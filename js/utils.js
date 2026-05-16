function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
}

function formatMoney(amount) {
    return '$' + amount.toLocaleString();
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function sizeForTile(i) {
    if (i % 10 === 0) return { x: 10, z: 10 };
    return { x: 6, z: 10 };
}

const Utils = {
    wrapText,
    formatMoney,
    lerp,
    easeInOutCubic
};
