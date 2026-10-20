/**
 * Geometry of the external label rendered under circular graph nodes
 * (BaseCircleNode). Shared with the graph builder so the vertical layout can
 * reserve room for long, multi-line labels instead of letting them run into
 * the next node.
 */
export const NODE_LABEL_WIDTH_PX = 220;
export const NODE_LABEL_FONT_SIZE_PX = 18;
export const NODE_LABEL_LINE_HEIGHT = 1.2;
/** Gap between the bottom of the circle and the top of the label. */
export const NODE_LABEL_OFFSET_PX = 8;

/**
 * Conservative average glyph width for bold 18px text. Slightly overestimated
 * so the layout errs on the side of extra space rather than overlap.
 */
const AVG_CHAR_WIDTH_PX = 10.5;
const CHARS_PER_LINE = Math.max(1, Math.floor(NODE_LABEL_WIDTH_PX / AVG_CHAR_WIDTH_PX));

/** Estimated number of lines the label wraps to (greedy word wrap). */
export function estimateLabelLines(label: string | undefined): number {
    const words = (label ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;

    let lines = 1;
    let lineLength = 0;
    for (const word of words) {
        // Words longer than a line are broken (overflow-wrap: anywhere).
        if (word.length > CHARS_PER_LINE) {
            if (lineLength > 0) lines++;
            lines += Math.ceil(word.length / CHARS_PER_LINE) - 1;
            lineLength = word.length % CHARS_PER_LINE || CHARS_PER_LINE;
            continue;
        }
        const needed = lineLength === 0 ? word.length : lineLength + 1 + word.length;
        if (needed > CHARS_PER_LINE) {
            lines++;
            lineLength = word.length;
        } else {
            lineLength = needed;
        }
    }
    return lines;
}

/** Estimated label height in px, including the offset below the circle. */
export function estimateLabelHeight(label: string | undefined): number {
    const lines = estimateLabelLines(label);
    if (lines === 0) return 0;
    return NODE_LABEL_OFFSET_PX + lines * NODE_LABEL_FONT_SIZE_PX * NODE_LABEL_LINE_HEIGHT;
}

/** Minimum free space kept between one node's label and the next node. */
export const NODE_ROW_GAP_PX = 24;
/** Default distance between row centers when labels are short. */
export const NODE_ROW_PITCH_PX = 180;

/**
 * Vertical centers for a column of circle nodes stacked top to bottom. Rows
 * keep the default pitch, and grow when a node's label would otherwise reach
 * the next circle.
 */
export function stackNodeCenters(
    items: { size: number; label?: string }[],
    startY: number
): number[] {
    const centers: number[] = [];
    let prevBottom = -Infinity;
    let prevCenter = -Infinity;
    for (const { size, label } of items) {
        const center = centers.length === 0
            ? startY
            : Math.max(prevCenter + NODE_ROW_PITCH_PX, prevBottom + NODE_ROW_GAP_PX + size / 2);
        centers.push(center);
        prevCenter = center;
        prevBottom = center + size / 2 + estimateLabelHeight(label);
    }
    return centers;
}
