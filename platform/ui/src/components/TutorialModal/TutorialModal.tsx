import React from 'react';
// substitute with actual demo video in `platform\ui\assets\tutorialvideo`
import demoVideo from '../../../assets/tutorialvideo/demo.mp4';

const TutorialModal = () => {
  return (
    <div style={{ margin: 'auto', width: '50%', objectFit: 'contain' }}>
      <video
        controls
        className="white-controls"
        style={{
          objectFit: 'contain',
          width: '100%',
        }}
      >
        <source
          src={demoVideo}
          type="video/mp4"
        />
      </video>

      <style jsx>{`
        .white-controls::-webkit-media-controls-panel {
          background-color: rgba(0, 0, 0, 0.5);
        }

        .white-controls::-webkit-media-controls-play-button,
        .white-controls::-webkit-media-controls-timeline,
        .white-controls::-webkit-media-controls-volume-slider,
        .white-controls::-webkit-media-controls-mute-button,
        .white-controls::-webkit-media-controls-fullscreen-button,
        .white-controls::-webkit-media-controls-time-remaining-display,
        .white-controls::-webkit-media-controls-current-time-display {
          color: white;
          filter: brightness(0) invert(1);
        }
      `}</style>
    </div>
  );
};

export default TutorialModal;
