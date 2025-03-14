var pageIds = ["page_id_1", "page_id_2", "page_id_3"]; // Replace with actual page IDs
var results = [];

for (var i in pageIds) {
    gs.print("Querying page: " + pageIds[i]);
    
    var page = new GlideRecord('sp_page');
    page.addQuery('id', pageIds[i]);
    page.query();
    
    if (page.next()) {
        var page_id = page.getValue('id');
        var page_sys_id = page.getValue('sys_id');
        var page_title = page.getValue('title');
        
        // get containers
        var containers = new GlideRecord('sp_container');
        containers.addQuery('sp_page', page_sys_id);
        containers.query();
        
        while (containers.next()) {
            gs.print("Querying containers for page: " + pageIds[i]);
            var container_id = containers.getValue('sys_id');
            
            // get rows
            var rows = new GlideRecord('sp_row');
            rows.addQuery('sp_container', container_id);
            rows.query();
            
            while (rows.next()) {
                gs.print("Querying rows for page: " + pageIds[i]);
                var row_id = rows.getValue('sys_id');
                
                // get columns
                var columns = new GlideRecord('sp_column');
                columns.addQuery('sp_row', row_id);
                columns.query();
                
                while (columns.next()) {
                    gs.print("Querying columns for page: " + pageIds[i]);
                    var column_id = columns.getValue('sys_id');
                    
                    // get instances
                    var instances = new GlideRecord('sp_instance');
                    instances.addQuery('sp_column', column_id);
                    instances.query();
                    
                    while (instances.next()) {
                        gs.print("Querying instances for page: " + pageIds[i]);
                        var widget_id = instances.getValue('sys_widget');
                        
                        // get widget
                        var widget = new GlideRecord('sp_widget');
                        widget.addQuery('sys_id', widget_id);
                        widget.query();
                        
                        if (widget.next()) {
                            gs.print("Found widget for page: " + pageIds[i]);
                            var widgetId = widget.getValue('id');
                            var widgetName = widget.getValue('name');
                            
                            results.push({
                                widget_id: widgetId,
                                widget_name: widgetName,
                                page: page_id,
                                page_title: page_title
                            });
                        }
                    }
                }
            }
        }
    }
}

// Output results
for(var j in results) {
    var r_widget_id = results[j].widget_id;
    var r_widget_name = results[j].widget_name;
    var r_page = results[j].page;
    var r_page_title = results[j].page_title;
    
    gs.print("T" + r_widget_id + "T" + r_widget_name + "T" + r_page_title + "T" + r_page);
}

// Output results as JSON
gs.print(JSON.stringify(results, null, 4));

// Output results as CSV
var csvHeader = "widget_id,widget_name,page_title,page_id";
var csvRows = [];

csvRows.push(csvHeader);

for(var k in results) {
    var row = [
        results[k].widget_id,
        '"' + results[k].widget_name.replace(/"/g, '""') + '"', // Escape quotes in CSV
        '"' + results[k].page_title.replace(/"/g, '""') + '"',  // Escape quotes in CSV
        results[k].page
    ].join(',');
    
    csvRows.push(row);
}

var csvOutput = csvRows.join('\n');
gs.print("CSV Output:");
gs.print(csvOutput);

// Create an attachment and email it
var fileName = "widget_page_mapping_" + new GlideDateTime().getDisplayValue() + ".csv";
var email = "recipient@example.com"; // Replace with actual email

// Create an attachment record
var attachment = new GlideSysAttachment();
var attachmentId = attachment.write('sys_script', gs.getProperty('instance_name') + '_' + fileName, 'text/csv', csvOutput);

// Send email with the attachment
if (attachmentId) {
    var emailObj = new GlideEmailOutbound();
    emailObj.setSubject("Widget to Page Mapping Report");
    emailObj.setBody("Attached is the latest widget to page mapping report from ServiceNow.");
    emailObj.addAttachment(attachmentId);
    emailObj.setFrom("servicenow@" + gs.getProperty('instance_name') + ".service-now.com");
    emailObj.setTo(email);
    var success = emailObj.send();
    
    gs.print("Email sent: " + success);
}
