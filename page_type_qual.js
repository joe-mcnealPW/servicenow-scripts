getQueryByPageType: function(pageType) {
        var query = '';
        switch (String(pageType).toLowerCase()) {
            case 'location':
                query = 'idSTARTSWITHdlac_location';
                break;
            case 'department':
                query = 'idSTARTSWITHdlac_dpt';
                break;
            default:
                query = ''; // see note below
        }
        return query;
    },


//javascript:new global.RefQualifierUtil().getQueryByPageType('location')
