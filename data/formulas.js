// Auto-extracted static data for Maths Study Hub. Loaded before the main script in index.html.
// Edit data here; app logic stays in index.html.
const FORMULAS=[
 {topic:'Mensuration', items:[
   {name:'Surface area of a sphere', html:`A = 4&pi;r<sup>2</sup>`},
   {name:'Curved surface of a cone', html:`A = &pi;r &times; l &nbsp;<span class="fx-note">(l = slant height)</span>`},
 ]},
 {topic:'Sequences & Series', items:[
   {name:'Binomial expansion', html:`(a + b)<sup>n</sup> = a<sup>n</sup> + <sup>n</sup>C<sub>1</sub>a<sup>n-1</sup>b + <sup>n</sup>C<sub>2</sub>a<sup>n-2</sup>b<sup>2</sup> + &hellip; + b<sup>n</sup>`,
     explain:`Expands a bracket raised to a whole-number power n. Each term is <sup>n</sup>C<sub>r</sub> &middot; a<sup>n-r</sup> &middot; b<sup>r</sup>, where <sup>n</sup>C<sub>r</sub> = n! / (r!(n-r)!) is read off Pascal's triangle. The powers of a fall while the powers of b rise, and they always add up to n.`},
   {name:'Binomial series (any n)', html:`(1 + x)<sup>n</sup> = 1 + nx + <span class="fx-fr"><span>n(n-1)</span><span>2!</span></span>x<sup>2</sup> + <span class="fx-fr"><span>n(n-1)(n-2)</span><span>3!</span></span>x<sup>3</sup> + &hellip;`,
     explain:`When n is a fraction or negative, the expansion never terminates. It is only valid when |x| &lt; 1, otherwise the terms grow without bound. Useful for approximations and for expanding things like (1 + x)<sup>1/2</sup>.`},
   {name:'Arithmetic series sum', html:`S<sub>n</sub> = <span class="fx-fr"><span>1</span><span>2</span></span>n(a + l) = <span class="fx-fr"><span>1</span><span>2</span></span>n[2a + (n-1)d]`},
   {name:'Geometric series sum', html:`S<sub>n</sub> = <span class="fx-fr"><span>a(1 - r<sup>n</sup>)</span><span>1 - r</span></span>`},
   {name:'Sum to infinity', html:`S<sub>&infin;</sub> = <span class="fx-fr"><span>a</span><span>1 - r</span></span> &nbsp;<span class="fx-note">(|r| &lt; 1)</span>`,
     explain:`A geometric series converges to a finite total only when each term shrinks, i.e. |r| &lt; 1. As n &rarr; &infin; the r<sup>n</sup> term vanishes, leaving a/(1 - r).`},
 ]},
 {topic:'Trigonometry', items:[
   {name:'Compound angles', html:`sin(A &plusmn; B) = sin A cos B &plusmn; cos A sin B<br>cos(A &plusmn; B) = cos A cos B &#8723; sin A sin B<br>tan(A &plusmn; B) = <span class="fx-fr"><span>tan A &plusmn; tan B</span><span>1 &#8723; tan A tan B</span></span>`,
     explain:`These break a sum or difference of angles into pieces you can evaluate. Watch the signs: cos flips the middle sign (cosA cosB &minus; sinA sinB for A+B), and tan's denominator takes the opposite sign to the numerator.`},
   {name:'Sum-to-product', html:`sin A + sin B = 2 sin<span class="fx-fr"><span>A+B</span><span>2</span></span> cos<span class="fx-fr"><span>A-B</span><span>2</span></span><br>cos A + cos B = 2 cos<span class="fx-fr"><span>A+B</span><span>2</span></span> cos<span class="fx-fr"><span>A-B</span><span>2</span></span>`},
   {name:'Small-angle approximations', html:`sin &theta; &asymp; &theta;&nbsp;&nbsp; cos &theta; &asymp; 1 - <span class="fx-fr"><span>&theta;<sup>2</sup></span><span>2</span></span>&nbsp;&nbsp; tan &theta; &asymp; &theta;`,
     explain:`For small &theta; measured in <b>radians</b>, the curves of sin, cos and tan are very close to these simple polynomials. Used to simplify limits and model small oscillations. They fail if &theta; is in degrees.`},
 ]},
 {topic:'Differentiation', items:[
   {name:'Differentiation from first principles', html:`f&prime;(x) = <span class="fx-lim">lim<sub>h&rarr;0</sub></span> <span class="fx-fr"><span>f(x + h) - f(x)</span><span>h</span></span>`,
     explain:`The formal definition of the derivative: the gradient of the chord between x and x+h, in the limit as the two points merge (h &rarr; 0). Every differentiation rule is ultimately derived from this.`},
   {name:'Standard derivatives', html:`<table class="fx-tbl"><tr><td>tan kx</td><td>k sec<sup>2</sup> kx</td></tr><tr><td>sec kx</td><td>k sec kx tan kx</td></tr><tr><td>cot kx</td><td>-k cosec<sup>2</sup> kx</td></tr><tr><td>cosec kx</td><td>-k cosec kx cot kx</td></tr></table>`},
   {name:'Quotient rule', html:`<span class="fx-fr"><span>d</span><span>dx</span></span>&nbsp;<span class="fx-fr"><span>f(x)</span><span>g(x)</span></span> = <span class="fx-fr"><span>f&prime;(x)g(x) - f(x)g&prime;(x)</span><span>[g(x)]<sup>2</sup></span></span>`,
     explain:`Differentiates one function divided by another. Memory aid: "low d-high minus high d-low, over the square of what's below". Order matters because of the minus sign.`},
 ]},
 {topic:'Integration', items:[
   {name:'Standard integrals (+ c)', html:`<table class="fx-tbl"><tr><td>sec<sup>2</sup> kx</td><td><span class="fx-fr"><span>1</span><span>k</span></span> tan kx</td></tr><tr><td>tan kx</td><td><span class="fx-fr"><span>1</span><span>k</span></span> ln|sec kx|</td></tr><tr><td>cot kx</td><td><span class="fx-fr"><span>1</span><span>k</span></span> ln|sin kx|</td></tr><tr><td>cosec kx</td><td>-<span class="fx-fr"><span>1</span><span>k</span></span> ln|cosec kx + cot kx|</td></tr><tr><td>sec kx</td><td><span class="fx-fr"><span>1</span><span>k</span></span> ln|sec kx + tan kx|</td></tr></table>`},
   {name:'Integration by parts', html:`&int; u <span class="fx-fr"><span>dv</span><span>dx</span></span> dx = uv - &int; v <span class="fx-fr"><span>du</span><span>dx</span></span> dx`,
     explain:`Reverses the product rule. Choose u to be the part that gets simpler when differentiated (LATE: Logs, Algebra, Trig, Exponentials is a good priority for picking u), and dv/dx to be the part you can integrate.`},
 ]},
 {topic:'Numerical Methods', items:[
   {name:'Trapezium rule', html:`&int;<sub>a</sub><sup>b</sup> y dx &asymp; <span class="fx-fr"><span>1</span><span>2</span></span>h{(y<sub>0</sub> + y<sub>n</sub>) + 2(y<sub>1</sub> + y<sub>2</sub> + &hellip; + y<sub>n-1</sub>)}, &nbsp; h = <span class="fx-fr"><span>b - a</span><span>n</span></span>`,
     explain:`Estimates the area under a curve by slicing it into n strips and treating each as a trapezium. The two end ordinates are counted once; every interior ordinate is counted twice. More strips (bigger n) gives a better estimate.`},
   {name:'Newton-Raphson iteration', html:`x<sub>n+1</sub> = x<sub>n</sub> - <span class="fx-fr"><span>f(x<sub>n</sub>)</span><span>f&prime;(x<sub>n</sub>)</span></span>`,
     explain:`Finds a root of f(x) = 0 by repeatedly following the tangent line down to the x-axis to get a better guess. Converges very fast near a root, but can fail if f&prime;(x<sub>n</sub>) is near zero or the starting value is poor.`},
 ]},
 {topic:'Probability', items:[
   {name:'Complement', html:`P(A&prime;) = 1 - P(A)`},
   {name:'Addition rule', html:`P(A &cup; B) = P(A) + P(B) - P(A &cap; B)`},
   {name:'Multiplication / conditional', html:`P(A &cap; B) = P(A) P(B | A)&nbsp;&nbsp;&rarr;&nbsp;&nbsp;P(B | A) = <span class="fx-fr"><span>P(A &cap; B)</span><span>P(A)</span></span>`,
     explain:`P(B | A) is the probability of B <i>given that A has happened</i>. You restrict attention to the outcomes where A occurred, so you divide the overlap P(A &cap; B) by P(A).`},
   {name:'Independent events', html:`P(B | A) = P(B)&nbsp;&nbsp;and&nbsp;&nbsp;P(A &cap; B) = P(A) P(B)`},
 ]},
 {topic:'Statistics', items:[
   {name:'Standard deviation & IQR', html:`Standard deviation = &radic;(Variance)&nbsp;&nbsp;&nbsp;IQR = Q<sub>3</sub> - Q<sub>1</sub>`},
   {name:'Sum of squares S<sub>xx</sub>', html:`S<sub>xx</sub> = &Sigma;(x<sub>i</sub> - x&#772;)<sup>2</sup> = &Sigma;x<sub>i</sub><sup>2</sup> - <span class="fx-fr"><span>(&Sigma;x<sub>i</sub>)<sup>2</sup></span><span>n</span></span>`,
     explain:`S<sub>xx</sub> measures the total spread of the data about the mean. The right-hand form (&Sigma;x&sup2; minus the squared total over n) is the quick one to use with a calculator. Variance = S<sub>xx</sub>/n.`},
   {name:'Binomial distribution B(n, p)', html:`P(X = x) = <sup>n</sup>C<sub>x</sub> p<sup>x</sup>(1 - p)<sup>n-x</sup>&nbsp;&nbsp;&nbsp;Mean = np&nbsp;&nbsp;&nbsp;Variance = np(1 - p)`,
     explain:`Models the number of successes in n independent trials, each with success probability p. <sup>n</sup>C<sub>x</sub> counts the ways to arrange x successes, p<sup>x</sup> is their probability, (1-p)<sup>n-x</sup> the failures.`},
   {name:'Sampling distribution of the mean', html:`<span class="fx-fr"><span>X&#772; - &mu;</span><span>&sigma; / &radic;n</span></span> &sim; N(0, 1)`,
     explain:`For a sample of n drawn from N(&mu;, &sigma;&sup2;), the sample mean X&#772; is itself Normal with the same mean but a smaller spread &sigma;/&radic;n. Standardising gives N(0,1), letting you find probabilities for the mean.`},
 ]},
 {topic:'Mechanics (SUVAT)', items:[
   {name:'Constant-acceleration formulae', html:`v = u + at&nbsp;&nbsp;&nbsp;s = ut + <span class="fx-fr"><span>1</span><span>2</span></span>at<sup>2</sup>&nbsp;&nbsp;&nbsp;s = vt - <span class="fx-fr"><span>1</span><span>2</span></span>at<sup>2</sup><br>v<sup>2</sup> = u<sup>2</sup> + 2as&nbsp;&nbsp;&nbsp;s = <span class="fx-fr"><span>1</span><span>2</span></span>(u + v)t`,
     explain:`The five "suvat" equations link displacement s, initial velocity u, final velocity v, acceleration a and time t for motion in a straight line with <b>constant</b> acceleration. Each equation omits one variable &mdash; pick the one missing the quantity you don't have.`},
 ]},
];
