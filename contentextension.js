/**
 * Retrieve basic content information (title + processed rich_text) for a portal content record.
 * Uses the existing getRichTextForContent() method for proper parsing and user-specific substitution.
 *
 * @param {string} contentSysId - sys_id of the sn_cd_content_portal record
 * @returns {object} { title: string, rich_text: string }
 *                   Returns empty strings if record not found or invalid
 */
cd_ContentDelivery.getPortalContentTitleAndRichText = function(contentSysId) {
    if (!contentSysId || typeof contentSysId !== 'string') {
        return {
            title: '',
            rich_text: ''
        };
    }

    var gr = new GlideRecord('sn_cd_content_portal');
    if (!gr.get(contentSysId)) {
        return {
            title: '',
            rich_text: ''
        };
    }

    var title = gr.getDisplayValue('title') || gr.getValue('title') || '';

    // Use the existing rich text retrieval method (handles blocks, user substitution, parsing, etc.)
    var richText = cd_ContentDelivery.getRichTextForContent(gr, 'rich_text') || '';

    return {
        title: title,
        rich_text: richText
    };
};
