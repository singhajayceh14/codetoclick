#!/bin/sh
{ cat part1_head.html; cat part7_body.html; \
 echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'; \
 echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>'; \
 for f in part2_data.js part3_ui.js part4_views.js part5_views2.js part6_reports.js part11_export.js part8_app.js part9_alloc.js part10_settings.js part12_admin.js part13_licences.js part14_revenue.js part15_profitability.js part16_auth.js; \
 do echo "<script>"; cat $f; echo "</script>"; done; } > app.html
python3 -c "
b=open('app.html',encoding='utf-8').read(); h,r=b.split('</style>',1)
open('test-page.html','w',encoding='utf-8').write('<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">'+h+'</style></head><body>'+r+'</body></html>')"
