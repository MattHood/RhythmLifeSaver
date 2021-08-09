\version "2.20.0"
%%% Title must be the same as the filename, without '.ly'. E.g., 'song.ly' & 'title = #"song"'
title = #"test4"

\include "common.ly"

\score {
    \new GrandStaff <<
    \new RhythmicStaff = "Right" \with 
      { instrumentName = #"RH"
        shortInstrumentName = #"RH"} 
    {
      
      \relative c' {
                \time 4/4
                    \new Voice {
                      \override NoteHead.output-attributes = #'((id . "RH"))
                      \override Rest.output-attributes = #'((id . "RH"))
                         r4 r r r |          
                         c2     c16 c c c   c16 c c8 |
                         c4      c8 c   r8 c16 c   c16 c c c
                    }
                
      } 
      
    }

    \new RhythmicStaff = "Left" \with 
      { instrumentName = #"LH"
        shortInstrumentName = #"LH"} 
    {
                \time 4/4
                    \new Voice {
                        \override NoteHead.output-attributes = #'((id . "LH"))
                        \override Rest.output-attributes = #'((id . "LH"))
                         r4 r r r |          
                         c2     c16 c c c   c16 c c8 |
                         c4      c8 c   r8 c16 c   c16 c c c
                    }
                
      
      
    }

    \new Lyrics \with { instrumentName = #"Counts"} \lyricmode {
                      "1"4 "2"4 "3"4 "4"4
                      "1"4 \PH "2"4 "3"16 "e" "+" "a" "4"16 "e" "+"8 
                      "1"4 "2"8 "+"  "3"8 "+"16 "a"   "4"16 "e" "+" "a" 
    }
    
    >>
}
