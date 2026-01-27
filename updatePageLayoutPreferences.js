/*
This script programmatically adds a new widget to a ServiceNow user preference layout configuration (such as a homepage or dashboard). It queries the specified user preference record, parses the existing widget array from JSON, and inserts a new widget at a designated column and order position. The script automatically increments the order value of all existing widgets in the target column that appear at or after the insertion point, ensuring no widgets are overwritten or displaced. After insertion and reordering, the updated widget array is sorted by column and order, then saved back to the user preference record. This is useful for bulk widget deployment, automated dashboard configuration, or programmatic layout management without manual intervention.
*/

// Configuration
const column = 1;
const order = 3;
const userPrefQuery = 'user=javascript:gs.getUserID()^name=homepage.layout';
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

// Query the user preference
var grUserPref = new GlideRecord('sys_user_preference');
grUserPref.addEncodedQuery(userPrefQuery);
grUserPref.query();

if (grUserPref.next()) {
  // Parse the current value (assuming it's JSON stored as string)
  var widgetArray = JSON.parse(grUserPref.getValue('value'));
  
  // Increment the order of all widgets in the target column 
  // that have an order >= target order
  widgetArray.forEach(function(widget) {
    if (widget.sp_column === column && widget.order >= order) {
      widget.order++;
    }
  });
  
  // Add the new widget to the array
  widgetArray.push(newObject);
  
  // Sort the array by column and order
  widgetArray.sort(function(a, b) {
    if (a.sp_column !== b.sp_column) {
      return a.sp_column - b.sp_column;
    }
    return a.order - b.order;
  });
  
  // Update the user preference with the new value
  grUserPref.setValue('value', JSON.stringify(widgetArray));
  grUserPref.update();
  
  gs.info('User preference updated successfully');
} else {
  gs.error('User preference not found');
}
