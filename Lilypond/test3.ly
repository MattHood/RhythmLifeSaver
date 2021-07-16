\include "template.ly"

\score {
    
    \new RhythmicStaff {
      \relative c' {
                \time 4/4
                <<
                    \new Voice = "rhythm" {
                         c2     c16 c c c   c16 c c8 |
                         c4      c8 c   r8 c16 c   c16 c c c
                    }

                    \new Voice = "counting" {
                         \hide NoteHead
                         \hide Stem
                         c4-"1" c4-"2" c16-"3" c-"e" c-"+" c-"a" c16-"4" c-"e" c8-"+" | \noBreak
                         c4-"1"      c8-"2" c-"+"   c8-"3" c16-"+" c-"a"   c16-"4" c-"e" c-"+" c-"a" |
                    }

                >>
      } 
    }
    
}
