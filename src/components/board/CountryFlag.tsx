/** Small vector flags stay crisp at any camera zoom and need no network requests. */
export function CountryFlag({ country }: { country: string }) {
  const horizontal = (colors: string[]) => colors.map((fill, i) => <rect key={i} y={i * 18 / colors.length} width="30" height={18 / colors.length} fill={fill} />)
  const vertical = (colors: string[]) => colors.map((fill, i) => <rect key={i} x={i * 30 / colors.length} width={30 / colors.length} height="18" fill={fill} />)
  const star = (x: number, y: number, color = '#ffdf43', scale = 1) => <path transform={`translate(${x} ${y}) scale(${scale})`} d="M0-5 1.2-1.5 5-1.5 2 1 3 5 0 2.5-3 5-2 1-5-1.5-1.2-1.5Z" fill={color} />
  const union = <><rect width="30" height="18" fill="#214a9c" /><path d="M0 0 30 18M30 0 0 18" stroke="white" strokeWidth="4" /><path d="M0 0 30 18M30 0 0 18" stroke="#f14662" strokeWidth="1.5" /><path d="M15 0V18M0 9H30" stroke="white" strokeWidth="6" /><path d="M15 0V18M0 9H30" stroke="#f14662" strokeWidth="3" /></>
  let art
  switch (country) {
    case 'Egypt': art = <>{horizontal(['#e54a54','#fff','#222a35'])}<path d="M14 7h2v5h-2z" fill="#dcb945" /></>; break
    case 'Morocco': art = <><rect width="30" height="18" fill="#d8374e" /><path d="M15 4 18 14 10 8H20L12 14Z" fill="none" stroke="#1b804d" strokeWidth="1.2" /></>; break
    case 'Spain': art = <><rect width="30" height="18" fill="#e9444c" /><rect y="4" width="30" height="10" fill="#ffdb42" /><rect x="8" y="7" width="3" height="5" rx="1" fill="#d65a54" /></>; break
    case 'Portugal': art = <><rect width="30" height="18" fill="#e03a4e" /><rect width="11" height="18" fill="#1f9962" /><circle cx="11" cy="9" r="4" fill="#ffd550" /><rect x="9" y="6" width="4" height="6" rx="1" fill="#f4f6ee" /></>; break
    case 'Italy': art = vertical(['#29a76c','#fff','#ef5264']); break
    case 'India': art = <>{horizontal(['#ff9b44','#fff','#35a462'])}<circle cx="15" cy="9" r="2.5" fill="none" stroke="#3256a2" /><path d="M15 7v4m-2-2h4" stroke="#3256a2" strokeWidth=".5" /></>; break
    case 'Sri Lanka': art = <><rect width="30" height="18" fill="#ffd554" /><rect x="2" y="2" width="4" height="14" fill="#299f79" /><rect x="6" y="2" width="4" height="14" fill="#f69032" /><rect x="12" y="2" width="16" height="14" fill="#98294f" /><path d="M16 11V7h6v3h2v3h-2v-2h-4v2h-2" fill="#fbd34a" /></>; break
    case 'Nepal': art = <><rect width="30" height="18" fill="#e9edf8" /><path d="M8 1V17H24L14 9H22Z" fill="#ef4260" stroke="#2949a3" strokeWidth="1.5" />{star(12,13,'white',.45)}<circle cx="12" cy="6" r="1.5" fill="white" /></>; break
    case 'Thailand': art = <>{horizontal(['#e84e63','#fff','#314998','#314998','#fff','#e84e63'])}</>; break
    case 'Vietnam': art = <><rect width="30" height="18" fill="#e7484d" />{star(15,9)}</>; break
    case 'Indonesia': art = horizontal(['#ed4856','#fff']); break
    case 'Sweden': art = <><rect width="30" height="18" fill="#258cce" /><path d="M10 0V18M0 9H30" stroke="#ffe15a" strokeWidth="3.5" /></>; break
    case 'Norway': art = <><rect width="30" height="18" fill="#e34b61" /><path d="M10 0V18M0 9H30" stroke="white" strokeWidth="5" /><path d="M10 0V18M0 9H30" stroke="#284b8e" strokeWidth="2.5" /></>; break
    case 'Finland': art = <><rect width="30" height="18" fill="white" /><path d="M10 0V18M0 9H30" stroke="#2c66b2" strokeWidth="4" /></>; break
    case 'France': art = vertical(['#326dc6','#fff','#f45a6a']); break
    case 'Germany': art = horizontal(['#262833','#f35158','#ffd652']); break
    case 'Netherlands': art = horizontal(['#e95a6a','#fff','#3972c4']); break
    case 'Australia': case 'New Zealand': art = <><rect width="30" height="18" fill="#234698" /><g transform="scale(.5)">{union}</g>{star(23,6,country==='Australia'?'white':'#ff7181',.45)}{star(21,13,'white',.4)}{star(12,13,'white',.45)}</>; break
    case 'Japan': art = <><rect width="30" height="18" fill="white" /><circle cx="15" cy="9" r="5" fill="#ef4861" /></>; break
    case 'United Kingdom': art = union; break
    case 'United States': art = <>{horizontal(Array.from({length:13},(_,i)=>i%2?'white':'#ed5367'))}<rect width="13" height="10" fill="#3555a0" />{[3,6,9].map(x=><g key={x}><circle cx={x} cy="3" r=".7" fill="white" /><circle cx={x} cy="6" r=".7" fill="white" /></g>)}</>; break
    default: art = <rect width="30" height="18" fill="#42dec4" />
  }
  return <g aria-hidden="true">{art}<rect width="30" height="18" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth=".6" /></g>
}
