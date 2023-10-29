function initializeTooltip(tooltip_id,
                             container_id,
                             text_color,
                             background_color,
                             opacity) {
    if ($(`#${tooltip_id}`).length == 0) {
        d3.select(`#${container_id}`)
        .append("div")
        .attr("id", tooltip_id)
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background-color", background_color || "black")
        .style("border-radius", "5px")
        .style("opacity", opacity || 0.8)
        .style("color", text_color || "white")
        .style("border", "2px solid black")
        .style("padding", "10px")
        .style("z-index", 1000);
    }
}


function showMapTooltip(d) {
    // TO REFACTOR: use either camelCase or snake_case but not both
    moveTooltipToCursor();
    $(this).addClass("ismouseover");
    
    const color = (d.ground_truth == d.prediction) ? "#66FF00": "#FF2400";
    const emoji = (d.ground_truth == d.prediction) ? "&#10004;&#65039;": "&#10060;";
    const tooltip_html = `
        <p><b>idx: </b>${d.idx}</p>
        <p><b>text: </b>${d.text}</p>
        <p><b>prediction: </b><span style="color: ${color};"><b>${d.prediction}</b> ${emoji}</span></p>
        <p><b>ground_truth: </b>${d.ground_truth}</p>`;

    const tooltip = d3.select("#map-tooltip");
    tooltip.html(tooltip_html);
    return tooltip.style("visibility", "visible");
}

function showTooltip(tooltip_id, 
                    content_html) {
    const tooltip = d3.select(`#${tooltip_id}`);
    tooltip.html(content_html);
    return tooltip.style("visibility", "visible");
}

function moveTooltipToCursor(tooltip_selector, offset) {
    const tooltip = d3.select(tooltip_selector);
    offset = offset || {Y: -200, X: 30};
    return tooltip
        .style("top", event.pageY + offset.Y + "px")
        .style("left", event.pageX + offset.X + "px");
}


function hideTooltip(tooltip_selector) {
    const tooltip = d3.select(tooltip_selector);
    $(this).removeClass("ismouseover");
    return tooltip.style("visibility", "hidden");
}


export { initializeTooltip, 
        showTooltip,
        showMapTooltip, 
        moveTooltipToCursor, 
        hideTooltip }

