/**
 * Fast OCR Pipeline
 * Deterministic, single-pass extraction of names and house numbers
 */

function fastOcrPipeline(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return {
      rows: [],
      stats: {
        totalRows: 0,
        rowsWithName: 0,
        rowsWithHouseNumber: 0,
      },
    };
  }

  const lines = rawText.split(/\n+/).map(line => line.trim()).filter(line => line.length > 0);

  const noisePatterns = [
    /^หน้า\s*\d+$/,
    /^Page\s+\d+$/i,
    /^\d+$/,
    /^[\s\-_]+$/,
  ];

  const filteredLines = lines.filter(line => {
    return !noisePatterns.some(pattern => pattern.test(line));
  });

  const rows = [];
  let pendingName = "";
  let pendingHouseNumber = "";
  let pendingRawText = "";

  const thaiNamePattern = /[ก-๙]{3,}/;
  const houseNumberPattern = /\b(\d{1,3}(?:\/\d{1,3})?(?:-\d{1,3})?)\b/;
  const numberOnlyPattern = /^\d{1,3}(?:\/\d{1,3})?(?:-\d{1,3})?$/;

  for (let i = 0; i < filteredLines.length; i++) {
    const line = filteredLines[i];
    const hasThai = thaiNamePattern.test(line);
    const houseMatch = line.match(houseNumberPattern);
    const isNumberOnly = numberOnlyPattern.test(line.trim());

    if (hasThai && !isNumberOnly) {
      if (pendingName && pendingRawText) {
        rows.push({
          name: pendingName,
          houseNumber: pendingHouseNumber || "",
          rawRowText: pendingRawText.trim(),
        });
      }

      pendingName = line.replace(houseNumberPattern, "").trim();
      pendingHouseNumber = houseMatch ? houseMatch[1] : "";
      pendingRawText = line;
    } else if (isNumberOnly && pendingName) {
      pendingHouseNumber = line.trim();
      pendingRawText = (pendingRawText + " " + line).trim();
    } else if (houseMatch && pendingName) {
      pendingHouseNumber = houseMatch[1];
      pendingRawText = (pendingRawText + " " + line).trim();
    } else if (hasThai) {
      if (pendingName && pendingRawText) {
        rows.push({
          name: pendingName,
          houseNumber: pendingHouseNumber || "",
          rawRowText: pendingRawText.trim(),
        });
      }
      pendingName = line.trim();
      pendingHouseNumber = "";
      pendingRawText = line;
    } else if (pendingName) {
      pendingRawText = (pendingRawText + " " + line).trim();
    }
  }

  if (pendingName && pendingRawText) {
    rows.push({
      name: pendingName,
      houseNumber: pendingHouseNumber || "",
      rawRowText: pendingRawText.trim(),
    });
  }

  const stats = {
    totalRows: rows.length,
    rowsWithName: rows.filter(r => r.name && r.name.trim().length > 0).length,
    rowsWithHouseNumber: rows.filter(r => r.houseNumber && r.houseNumber.trim().length > 0).length,
  };

  return {
    rows,
    stats,
  };
}

module.exports = {
  fastOcrPipeline,
};
