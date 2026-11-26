
(function(){var f=document.getElementById('sf-consol-calc');if(!f)return;var t=f.querySelector('[data-calc="total"]'),v=f.querySelector('[data-calc="verdict"]');
function run(){var sum=0,n=0;f.querySelectorAll('input').forEach(function(i){var x=parseFloat(i.value);if(x>0){sum+=x;n++;}});t.textContent=sum?sum.toFixed(1):'0';
if(!n){v.textContent='Enter at least one supplier volume to see a suggested shipment.';return;}
var s=n>1?n+' suppliers, ':'';var msg;
if(sum<15)msg=s+'about '+sum.toFixed(1)+' m³ quoted. LCL (shared container) is the likely fit; under 5 m³ the fixed charges dominate, so combining with a later order can be worth it.';
else if(sum<28)msg=s+'about '+sum.toFixed(1)+' m³ quoted. A 20-foot container (20GP) is the likely fit once packed volume is measured; close to 28 m³, a 40HQ may be cheaper per m³.';
else if(sum<=68)msg=s+'about '+sum.toFixed(1)+' m³ quoted. A 40-foot high-cube (40HQ) is the likely fit. Packed volume usually runs 10–25% above factory figures, so send us the packing lists for a loading review.';
else msg=s+'about '+sum.toFixed(1)+' m³ quoted. That is more than one 40HQ: we plan two containers or phase the shipment around your installation schedule.';
v.textContent=msg;}
f.addEventListener('input',run);})();
