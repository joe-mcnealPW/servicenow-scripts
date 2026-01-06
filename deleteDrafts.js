// This script can be run as a Fix Script, Background Script, or Scheduled Job in ServiceNow.
// It deletes sc_cart_item records where cart.name = 'draft_items' and sys_updated_on is older than X days.
// It also deletes related sc_item_option records linked via the cart_item field.

// Configurable variable for the number of days
var days = 30; // Change this value as needed

// Calculate the cutoff date/time (X days ago)
var cutoff = new GlideDateTime();
cutoff.addDaysUTC(-days); // Use UTC to avoid timezone issues

// Step 1: Query sc_cart_item records to delete and collect their sys_ids
var itemIds = [];
var gr = new GlideRecord('sc_cart_item');
gr.addQuery('cart.name', 'draft_items');
gr.addQuery('sys_updated_on', '<', cutoff);
gr.query();

while (gr.next()) {
    itemIds.push(gr.getUniqueValue());
}

// Step 2: If there are items to delete, proceed
if (itemIds.length > 0) {
    // Delete related sc_item_option records using deleteMultiple for efficiency
    var opt = new GlideRecord('sc_item_option');
    opt.addQuery('cart_item', 'IN', itemIds.join(','));
    opt.deleteMultiple();
    
    // Delete the sc_cart_item records using deleteMultiple
    var cartGr = new GlideRecord('sc_cart_item');
    cartGr.addQuery('sys_id', 'IN', itemIds.join(','));
    cartGr.deleteMultiple();
    
    gs.info('Deleted ' + itemIds.length + ' draft sc_cart_item records and their related sc_item_option records.');
} else {
    gs.info('No draft sc_cart_item records found older than ' + days + ' days.');
}
