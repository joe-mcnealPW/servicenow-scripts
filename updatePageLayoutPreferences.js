// Configuration
const column = 1;
const order = 3;
const newObject = {
  sys_id: "new_widget_sys_id",
  is_shown: true,
  sp_column: column,
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
  order: order
};

// Increment the order of all widgets in the target column 
// that have an order >= target order
widgetArray.forEach(widget => {
  if (widget.sp_column === column && widget.order >= order) {
    widget.order++;
  }
});

// Add the new widget to the array
widgetArray.push(newObject);

// Sort the array by column and order
widgetArray.sort((a, b) => {
  if (a.sp_column !== b.sp_column) {
    return a.sp_column - b.sp_column;
  }
  return a.order - b.order;
});
