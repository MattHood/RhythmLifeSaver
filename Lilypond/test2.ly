\version "2.20.0"
title = #"test2"

\include "common.ly"

\score {
    <<
    \new RhythmicStaff \with { instrumentName = #"AH"} {
      \time 3/4 c'2 c'16 c' c' c' |  \tuplet 5/4 { c'16 c' c' c' c' } c4 \tuplet 3/2 {c8 c c}
    }
    
    >>
    
}
