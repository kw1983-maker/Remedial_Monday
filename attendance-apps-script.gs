/**
 * YES Programme — Attendance receiver
 * ------------------------------------
 * Paste this into your Google Sheet's Apps Script editor, then deploy it as a
 * Web app. The remedial page calls it to fill in today's attendance column
 * automatically, so you never have to download a file again.
 *
 * SETUP (once):
 *   1. Open your Google Sheet.
 *   2. Menu: Extensions -> Apps Script.
 *   3. Delete anything in the editor, paste ALL of this file, click 💾 Save.
 *   4. Click Deploy -> New deployment.
 *   5. "Select type" (gear icon) -> Web app.
 *   6. Description: anything.  Execute as: Me.  Who has access: Anyone.
 *   7. Click Deploy, allow/authorise when asked.
 *   8. Copy the Web app URL (it ends with /exec).
 *   9. In the remedial page, Attendance tab, tap ⚙️ and paste that URL.
 *
 * That's it. From then on: mark absentees, tap "📤 Send to Google Sheet".
 */

// Optional: set a secret word here AND add &token=thatword to the link if you
// want to stop strangers writing to your sheet. Leave '' to keep it open.
var TOKEN = '';

function doGet(e){
  try{
    var p = (e && e.parameter) || {};
    if(TOKEN && p.token !== TOKEN) return page('🔒 Wrong or missing token.', false);

    var cls  = (p.cls  || '').trim();            // "STEM 1" or "1L"
    var date = (p.date || '').trim();            // e.g. "27/7"
    var names = (p.present || '').split('|')
                  .map(function(s){ return s.trim(); })
                  .filter(function(s){ return s.length; });

    if(!cls || !date) return page('Missing class or date in the link.', false);

    var sheet = findAttendanceSheet_();
    if(!sheet) return page('Could not find the attendance tab (looking for "YES Programme Attendance").', false);

    var vals = sheet.getDisplayValues();

    // Header row = the row that has "STEM 1" in column A; it holds the date columns.
    var headerRow = -1;
    for(var r=0; r<vals.length; r++){
      if(String(vals[r][0]).trim().toUpperCase() === 'STEM 1'){ headerRow = r; break; }
    }
    if(headerRow < 0) return page('Could not find the "STEM 1" header row (the row with the dates).', false);

    // Target column = the one under today's date in the header row.
    var targetCol = -1;
    for(var c=3; c<vals[headerRow].length; c++){
      if(String(vals[headerRow][c]).trim() === date){ targetCol = c; break; }
    }
    if(targetCol < 0) return page('Date column "'+date+'" was not found in the sheet. Add that date to the header row first.', false);

    // "1L Class" marker row separates the two sections.
    var lRow = -1;
    for(var r2=0; r2<vals.length; r2++){
      if(String(vals[r2][0]).trim().toUpperCase().indexOf('1L') === 0){ lRow = r2; break; }
    }

    // Row range (0-based, inclusive) for the requested class.
    var start, end;
    if(cls.toUpperCase() === 'STEM 1'){
      start = headerRow + 1;
      end   = (lRow > headerRow ? lRow - 1 : vals.length - 1);
    }else{                                   // 1L
      if(lRow < 0) return page('Could not find the "1L Class" section.', false);
      start = lRow + 1;
      end   = vals.length - 1;
    }

    var mark = (cls.toUpperCase() === 'STEM 1') ? '✅' : '1';

    // Build a lookup of name -> sheet row (1-based) inside this section,
    // and clear the column so a re-send is always authoritative.
    var rowByName = {};
    for(var i=start; i<=end; i++){
      var nm = String(vals[i][2]).trim();      // column C = NAMA
      if(!nm) continue;
      rowByName[nm.toUpperCase()] = i + 1;      // 1-based row
      sheet.getRange(i + 1, targetCol + 1).clearContent();
    }

    // Write the mark for everyone present; remember anyone we couldn't match.
    var written = 0, unmatched = [];
    names.forEach(function(nm){
      var row = rowByName[nm.toUpperCase()];
      if(row){ sheet.getRange(row, targetCol + 1).setValue(mark); written++; }
      else   { unmatched.push(nm); }
    });

    var total = 0;
    for(var k in rowByName){ total++; }
    var absent = total - written;

    var msg = '✅ Attendance saved\n' + cls + '  —  ' + date + '\n' +
              written + ' present, ' + absent + ' absent';
    if(unmatched.length){
      msg += '\n\n⚠️ Not found in the sheet (check spelling): ' + unmatched.join(', ');
    }
    return page(msg, true);

  }catch(err){
    return page('Error: ' + err, false);
  }
}

/** Find the tab whose top rows mention "YES Programme Attendance". */
function findAttendanceSheet_(){
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for(var s=0; s<sheets.length; s++){
    var top = sheets[s].getRange(1, 1, Math.min(6, sheets[s].getMaxRows()),
                                 Math.min(4, sheets[s].getMaxColumns())).getDisplayValues();
    for(var r=0; r<top.length; r++){
      for(var c=0; c<top[r].length; c++){
        if(String(top[r][c]).toUpperCase().indexOf('YES PROGRAMME ATTENDANCE') >= 0) return sheets[s];
      }
    }
  }
  return null;
}

/** Simple confirmation / error page. */
function page(text, ok){
  var bg = ok ? '#e8f7ec' : '#fdecec';
  var bd = ok ? '#2e9e4f' : '#d64545';
  var html =
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;' +
    'margin:40px auto;padding:22px 24px;border-radius:16px;background:'+bg+';border:2px solid '+bd+';' +
    'font-size:19px;line-height:1.5;white-space:pre-wrap;color:#173;">' +
    text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
    '</div>' +
    '<p style="text-align:center;font-family:system-ui,sans-serif;color:#888">' +
    'You can close this tab and go back to the app.</p>';
  return HtmlService.createHtmlOutput(html).setTitle('Attendance');
}
