function insertWidget(widgetArray, newWidget, targetColumn, targetOrder) {
  // First, increment the order of all widgets in the target column 
  // that have an order >= targetOrder
  widgetArray.forEach(widget => {
    if (widget.sp_column === targetColumn && widget.order >= targetOrder) {
      widget.order++;
    }
  });
  
  // Set the new widget's properties
  newWidget.sp_column = targetColumn;
  newWidget.order = targetOrder;
  
  // Add the new widget to the array
  widgetArray.push(newWidget);
  
  // Optional: Sort the array by column and order for cleaner organization
  widgetArray.sort((a, b) => {
    if (a.sp_column !== b.sp_column) {
      return a.sp_column - b.sp_column;
    }
    return a.order - b.order;
  });
  
  return widgetArray;
}

// Example usage:
const column = 1;
const order = 3;
const newObject = {
  sys_id: "new_widget_sys_id",
  is_shown: true,
  sp_column: null, // Will be set by the function
  description: "",
  is_collapsed: false,
  rules: {
    is_locked: false,
    is_collapsible: true,
    is_movable: true,
    default_row: -1,
    default_column: -1
  },
  id: "my_new_widget",
  sp_widget: "My New Widget",
  order: null // Will be set by the function
};

// Insert the widget
insertWidget(yourWidgetArray, newObject, column, order);
