"use client";

import { useEffect } from "react";
import { useAudio } from "../contexts/AudioContext";

const BASE_TITLE = "Streamify Player";

export default function PageTitle() {
  const { currentSong } = useAudio();

  useEffect(() => {
    if (currentSong?.title) {
      document.title = `${BASE_TITLE} | ${currentSong.title}`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [currentSong?.title]);

  return null;
}
