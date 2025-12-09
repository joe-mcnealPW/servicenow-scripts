// Generic reusable function
  c.openActionModal = function(action) {
    var isConfirm = action === 'confirm';

    spModal.open({
      title: isConfirm ? 'Approve Request' : 'Deny Request',
      message: isConfirm 
        ? 'Are you sure you want to <strong>approve</strong> this request?'
        : 'Are you sure you want to <strong>deny</strong> this request?<br><small>A reason may be required later.</small>',

      // Custom buttons
      buttons: [
        { label: 'Cancel', cancel: true },                    // dismiss → reject promise
        { label: isConfirm ? 'Approve' : 'Deny', primary: true }  // resolve promise
      ],

      size: 'sm'  // optional: 'sm', 'md', 'lg'
    }).then(function(confirmed) {
      // This runs only when user clicks the PRIMARY button (Approve/Deny)
      if (confirmed) {
        if (isConfirm) {
          alert('Request APPROVED!');
          // → call your server update here
        } else {
          alert('Request DENIED!');
          // → call deny logic
        }
      }
    });
  };
