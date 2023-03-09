import React, { useState, useEffect, useRef, useCallback } from "react";

import { MicrophoneIcon, StopIcon } from "@heroicons/react/24/solid";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID;

const DEFAULT_MESSAGES = [
  {
    role: "system",
    content:
      "You are a conversational voice assistant.\n" +
      "You answer user questions truthfully and politely.\n" +
      "Write messages phonetically to assist text-to-speech and use punctuation.\n",
  },
];

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  });
  const update = useCallback(
    (newValue) => {
      setValue(newValue);
      localStorage.setItem(key, JSON.stringify(newValue));
    },
    [key]
  );
  return [value, update];
}

function completeChat(history) {
  const apiKey = OPENAI_API_KEY || localStorage.getItem("OPENAI_API_KEY");

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: history,
    }),
  })
    .then((r) => r.json())
    .then((r) => r.choices[0].message.content.trim())
    .catch((e) => {
      console.error(e);
      alert(
        "Request to OpenAI API Failed. Please update your API key in by clicking 'Settings'."
      );
      return null;
    });
}

function transcribeAudio(formData) {
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  })
    .then((r) => r.json())
    .then((data) => data.text.trim());
}

const GET_VOICES_DELAY_MS = 100;
const PAUSE_DELAY_MS = 1000;

async function speak(text: string) {
  const synth = window.speechSynthesis;
  var timeout;
  function timeoutFunction() {
    if (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    ) {
    } else {
      synth.pause();
      synth.resume();
    }
    timeout = setTimeout(timeoutFunction, PAUSE_DELAY_MS);
  }
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const allVoices = synth.getVoices();
      synth.cancel();
      timeout = setTimeout(timeoutFunction, PAUSE_DELAY_MS);
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.voice = allVoices.find((v) => v.lang === "en-US");
      utterance.onend = () => {
        clearTimeout(timeout);
        resolve();
      };
      synth.speak(utterance);
    }, GET_VOICES_DELAY_MS);
  });
}

function generateAudio(text) {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": `${ELEVEN_LABS_API_KEY}`,
      },
      body: JSON.stringify({
        text: text,
        voice_settings: {
          stability: 0,
          similarity_boost: 1,
        },
      }),
    }
  ).then((r) => r.blob());
}

async function playAudio(blob: Blob) {
  return new Promise<void>((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    audio.onended = () => {
      resolve();
    };
    audio.play();
  });
}

function AudioRecorder({
  onRecording,
}: {
  onRecording?: (recording: Blob) => void;
}) {
  const [permission, setPermission] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const [recordingStatus, setRecordingStatus] = useState("inactive");
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const getMicAndRecord = () => {
    if (!("MediaRecorder" in window)) {
      alert("The MediaRecorder API is not supported in your browser.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: false,
      })
      .then((streamData) => {
        setPermission(true);
        setRecordingStatus("recording");
        setStream(streamData);
        const media = new MediaRecorder(streamData, {
          type: "audio/mp3",
        } as MediaRecorderOptions);
        //set the MediaRecorder instance to the mediaRecorder ref
        mediaRecorder.current = media;
        //invokes the start method to start the recording process
        mediaRecorder.current.start();
        let localAudioChunks: Blob[] = [];
        mediaRecorder.current.ondataavailable = (event) => {
          if (typeof event.data === "undefined") return;
          if (event.data.size === 0) return;
          localAudioChunks.push(event.data);
        };
        setAudioChunks(localAudioChunks);
      });
  };

  const stopRecording = () => {
    if (mediaRecorder.current === null) return;
    setRecordingStatus("inactive");
    //stops the recording instance
    mediaRecorder.current.stop();
    mediaRecorder.current.onstop = () => {
      //creates a blob file from the audiochunks data
      const audioBlob = new Blob(audioChunks, { type: "audio/mp3" });
      if (onRecording) onRecording(audioBlob);
      //creates a playable URL from the blob file.
      setAudioChunks([]);
      if (stream) {
        stream
          .getTracks() // get all tracks from the MediaStream
          .forEach((track) => track.stop()); // stop each of them
        setStream(null);
        setPermission(false);
        mediaRecorder.current = null;
      }
    };
  };

  return (
    <>
      {!permission || recordingStatus === "inactive" ? (
        <button
          onClick={getMicAndRecord}
          type="button"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex justify-center items-center text-center"
          title="Click to start recording"
        >
          <MicrophoneIcon className="h-5 w-5" />
        </button>
      ) : null}
      {recordingStatus === "recording" ? (
        <button
          onClick={stopRecording}
          type="button"
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex justify-center items-center text-center"
          title="Click to stop recording"
        >
          <StopIcon className="h-5 w-5" />
        </button>
      ) : null}
    </>
  );
}

function SpeechTranscriber({
  onTranscribed,
}: {
  onTranscribed: (string) => void;
}) {
  function handleRecording(recording: Blob) {
    const audioFile = new File([recording], "file.mp3", {
      type: "audio/mp3",
    });
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    transcribeAudio(formData).then((text) => {
      onTranscribed(text);
    });
  }

  return <AudioRecorder onRecording={handleRecording} />;
}

function ChatBox({ messages }) {
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (listRef.current === null) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);
  return (
    <ul
      className="p-2 bg-gray-200 rounded-lg overflow-y-scroll grow h-full gap-2 flex flex-col shadow-inner border-2 border-gray-200"
      ref={listRef}
    >
      {messages.map((message, index) => (
        <li key={index} onClick={() => speak(message.content)}>
          {message.role === "user" ? (
            <div className="flex flex-row-reverse grow">
              <div className="bg-blue-500 rounded-lg p-2 shadow max-w-full break-words whitespace-pre-wrap">
                <p className="text-white">{message.content}</p>
              </div>
            </div>
          ) : message.role == "assistant" ? (
            <div className="flex flex-row grow">
              <div className="bg-white rounded-lg p-2 shadow max-w-full break-words whitespace-pre-wrap">
                <p className="text-black">{message.content}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-row grow">
              <div className="bg-white rounded-lg p-2 shadow max-w-full w-full break-words whitespace-pre-wrap">
                <p className="text-gray-400 italic text-xs">{message.role}</p>
                <p className="text-gray-600 italic">{message.content}</p>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function SpeechTranscriberNative({
  onTranscribed,
}: {
  onTranscribed?: (text: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (SpeechRecognition) {
      if (!enabled) {
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        if (onTranscribed) {
          onTranscribed(
            event.results[0][event.results[0].length - 1].transcript
          );
        }
      };
      recognition.onend = () => {
        recognition.start();
      };
      recognition.onerror = (error) => {
        console.error(error);
      };
      recognition.start();
      return () => {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.stop();
      };
    }
  }, [enabled, onTranscribed]);

  return (
    <>
      {!enabled ? (
        <button
          onClick={() => setEnabled(true)}
          type="button"
          className="bg-blue-500 hover:bg-blue-700 outline-none text-white focus:ring-2 focus:ring-red-blue-500 focus:ring-offset-2 font-bold p-4 rounded flex justify-center items-center text-center"
          title="Click to start recording"
        >
          <MicrophoneIcon className="h-7 w-7" />
        </button>
      ) : (
        <button
          onClick={() => setEnabled(false)}
          type="button"
          className="bg-red-500 hover:bg-red-600 text-white outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 font-bold p-4 rounded flex "
          title="Click to stop recording"
        >
          <div className="flex w-full h-full justify-center items-center text-center relative">
            <StopIcon className="h-7 w-7 relative" />
            <StopIcon className="h-7 w-7 absolute animate-ping" />
          </div>
        </button>
      )}
    </>
  );
}

function Chat() {
  const [messages, setMessages] = useLocalStorage("messages", DEFAULT_MESSAGES);
  const [audioPlaying, setAudioPlaying] = useState(false);

  async function sendMessage(message) {
    if (message === "") return;
    const newChat = [...messages, { role: "user", content: message }];
    setMessages(newChat);
    const res = await completeChat(newChat);
    if (res === null) {
      return;
    }
    setMessages([...newChat, { role: "assistant", content: res }]);
    setAudioPlaying(true);
    await speak(res);
    // uncomment to use the eleven labs api
    // await playAudio(await generateAudio(res));
    setAudioPlaying(false);
  }

  function reset() {
    const shouldReset = window.confirm("Are you sure you want to clear chat?");
    if (!shouldReset) return;
    setMessages(DEFAULT_MESSAGES);
  }

  function settings() {
    const apiKey = prompt(
      "Enter your OpenAI API key. Click 'Ok' to clear key."
    );
    if (apiKey === null) return;
    localStorage.setItem("OPENAI_API_KEY", apiKey);
    alert("API key saved!");
  }

  return (
    <>
      <div className="flex flex-col gap-4 grow overflow-y-auto overflow-x-visible w-full p-1">
        <div className="flex flex-wrap justify-between items-baseline gap-y-4 gap-x-4">
          <h1 className="text-2xl font-bold">🤖 + 🎤 Chat</h1>
          <div className="flex gap-4">
            <button
              className="text-blue-400 hover:text-blue-500"
              onClick={settings}
            >
              Settings
            </button>
            <button
              className="text-blue-400 hover:text-blue-500"
              onClick={reset}
            >
              Clear Chat
            </button>
          </div>
        </div>
        <ChatBox messages={messages} />
        <SpeechTranscriberNative
          onTranscribed={(text) => {
            if (audioPlaying) return;
            sendMessage(text);
          }}
        />
      </div>
    </>
  );
}

export function App() {
  return (
    <>
      <div className="flex justify-center bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-green-300 via-blue-500 to-purple-600 p-0 sm:p-8 h-full">
        <div className="max-w-prose w-full bg-white p-2 sm:py-8 sm:px-10 max-h-full rounded-none sm:rounded-2xl shadow-lg shadow-indigo-500/50 drop-shadow-xl flex flex-col gap-2 sm:gap-8">
          <Chat />
        </div>
      </div>
    </>
  );
}
