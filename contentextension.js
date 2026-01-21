var cd_ContentDeliveryExtended = Class.create();
cd_ContentDeliveryExtended.prototype = Object.extendsObject(cd_ContentDelivery, {

    // ------------------------------------------------------------------------
    // NEW METHOD: Retrieve single content item by sys_id
    // ------------------------------------------------------------------------
    getContentBySysId: function(sysId, includeRichText, isNews, visibilityRecord) {
        if (!sysId) {
            return null;
        }

        var cd_Utils = new sn_cd.cd_Utils();
        var contentTable = isNews 
            ? cd_CommonConstants.CONTENT_TABLE_NEWS 
            : cd_CommonConstants.CONTENT_TABLE_PORTAL;

        var grContent = new GlideRecord(contentTable);
        if (!grContent.get(sysId)) {
            return null;
        }

        // Quick active check (you can remove or make optional)
        if (grContent.getValue('active') !== '1') {
            return null;
        }

        var results = {
            contentMap: {},
            contentArray: []
        };

        var idx;

        if (isNews) {
            idx = this.addNewsContentToResult(
                grContent,
                results,
                sysId,
                visibilityRecord,
                true   // precomputedAccess – bypass audience check
            );
        } else {
            idx = this._addContentToResult(
                grContent,
                results,
                visibilityRecord
            );
        }

        if (typeof idx === 'undefined' || idx < 0) {
            return null;
        }

        var contentObj = results.contentArray[idx];

        // Optionally hydrate rich text fields (expensive → opt-in)
        if (includeRichText === true) {
            contentObj.rich_text = this.getRichTextForContent(grContent, 'rich_text');
            contentObj.rich_content_html = this.getRichTextForContent(grContent, 'rich_content_html');

            if (contentObj.rich_content_html) {
                contentObj.rich_content_html = contentObj.rich_content_html.replace(/<iframe /g, '<iframe loading="lazy" ');
            }

            // Bonus fields if useful
            contentObj.headline_text = contentObj.headline_text || this.getRichTextForContent(grContent, 'headline');
            contentObj.heading_text  = contentObj.heading_text  || this.getRichTextForContent(grContent, 'heading_text');
            contentObj.body_text     = contentObj.body_text     || this.getRichTextForContent(grContent, 'body_text');
        }

        // Helpful metadata
        contentObj.sys_class_name = grContent.getValue('sys_class_name');
        contentObj.content_type   = grContent.getValue('content_type');
        contentObj.is_news        = !!isNews;

        // Attach visibility/scheduling context if available
        if (visibilityRecord && visibilityRecord.isValidRecord()) {
            contentObj.schedule_order       = visibilityRecord.getValue('order');
            contentObj.availability_start   = visibilityRecord.getValue('availability_start_date');
            contentObj.availability_end     = visibilityRecord.getValue('availability_end_date');
            contentObj.topic                = visibilityRecord.getValue('topic');
            contentObj.sp_page              = visibilityRecord.getDisplayValue('sp_page');
        }

        return contentObj;
    },

    // ------------------------------------------------------------------------
    // Optional convenience wrappers
    // ------------------------------------------------------------------------
    getPortalContentBySysId: function(sysId, includeRichText) {
        return this.getContentBySysId(sysId, includeRichText, false);
    },

    getNewsContentBySysId: function(sysId, includeRichText) {
        return this.getContentBySysId(sysId, includeRichText, true);
    },

    // ------------------------------------------------------------------------
    // You can also override / enhance existing methods here if needed
    // Example:
    // ------------------------------------------------------------------------
    /*
    getContentForWidgetInstance: function(instanceId, topicId, sysId, params) {
        // Custom logic before or after calling parent
        var result = this.getSuper().getContentForWidgetInstance(instanceId, topicId, sysId, params);
        // ... modify result ...
        return result;
    },
    */

    type: 'cd_ContentDeliveryExtended'
});
