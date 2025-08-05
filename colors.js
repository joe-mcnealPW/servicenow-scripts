setCellStyle: function(column, displayValue) {
    // Early return if column is not color mapped
    if (!c.data.color_mapped.includes(column)) {
        return null;
    }

    console.log(column + " should be mapped.");
    
    var colorMapping = c.data.tabs[c.state.currentIndex].color_mapping;
    
    // Find the mapping for this column
    var columnMapping = colorMapping.find(function(mapping) {
        return mapping.field === column;
    });
    
    if (!columnMapping) {
        return null;
    }
    
    // Find the color configuration for this display value
    var colorConfig = columnMapping.colors.find(function(config) {
        return config.options.includes(displayValue);
    });
    
    if (colorConfig) {
        return {
            'background-color': colorConfig.background,
            'color': colorConfig.font
        };
    }
    
    // Return null if no matching color configuration found
    return null;
}



setCellStyle: function(column, displayValue) {
    if(c.data.color_mapped.includes(column)) {
        console.log(column + " should be mapped.");
        var map = c.data.tabs[c.state.currentIndex].color_mapping;

        for(var i in map) {
            if(map[i].field == column) {
                for(var j in map[i].colors) {
                    for(var k in map[i].colors[j].options) {
                        if(map[i].colors[j].options[k] == displayValue) {
                            return {
                                background: map[i].colors[j].background,
                                color: map[i].colors[j].font,
                            }
                        }
                    }
                }
            }
        }
    }
}
