import React, { useState, useEffect, useRef, useCallback } from "react";

import { MicrophoneIcon, StopIcon } from "@heroicons/react/24/solid";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID;

const DEFAULT_MESSAGES = [
  {
    role: "system",
    content:
      "You are an AI Voice Assistant you must answer user questions truthfully and politely.",
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
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: history,
    }),
  })
    .then((r) => r.json())
    .then((r) => r.choices[0].message.content.trim());
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

function SpeechSynthesizer({ text }: { text?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  function handleClick() {
    if (audioRef.current) {
      audioRef.current.play();
    }
  }

  useEffect(() => {
    if (text && text.length > 0) {
      generateAudio(text).then((blob) => {
        setAudioBlob(blob);
      });
    }
  }, [text]);

  useEffect(() => {
    if (audioRef.current && audioBlob) {
      audioRef.current.src = URL.createObjectURL(audioBlob);
      audioRef.current.play();
    }
  }, [audioBlob]);

  return (
    <>
      <audio ref={audioRef} />
    </>
  );
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
      className="py-4 px-2 bg-gray-200 rounded overflow-y-scroll grow h-full gap-2 flex flex-col shadow-inner"
      ref={listRef}
    >
      {messages.map((message, index) => (
        <li key={index}>
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

function Chat() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useLocalStorage("messages", DEFAULT_MESSAGES);
  const [message, setMessage] = useLocalStorage("message", "");
  const [lastAssistantMessage, setLastAssistantMessage] = useState("");

  function sendMessage(e) {
    e.preventDefault();
    if (message === "") return;
    setMessage("");
    const newChat = [...messages, { role: "user", content: message }];
    setMessages(newChat);
    completeChat(newChat).then((res) => {
      setMessages([...newChat, { role: "assistant", content: res }]);
      setLastAssistantMessage(res);
    });
  }

  function reset() {
    setMessages(DEFAULT_MESSAGES);
    setMessage("");
  }

  return (
    <>
      <div className="flex flex-col gap-2 grow">
        <div className="flex justify-between">
          <h1>AI Voice Chat</h1>
          <button className="text-blue-400" onClick={reset}>
            Reset
          </button>
        </div>
        <ChatBox messages={messages} />
        <form className="flex gap-2" onSubmit={sendMessage}>
          <input
            className="border border-gray-300 rounded p-2 grow outline-none appearance-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type your message"
            value={message}
            ref={inputRef}
            onChange={(e) => setMessage(e.target.value)}
          />
          <SpeechTranscriber
            onTranscribed={(text) => {
              setMessage(text);
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white rounded p-2 disabled:bg-gray-300 disabled:text-gray-500"
            disabled={message === ""}
          >
            Send
          </button>
        </form>
        <SpeechSynthesizer text={lastAssistantMessage} />
      </div>
    </>
  );
}

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    synth.onvoiceschanged = () => {
      setVoices(synth.getVoices());
    };
  }, []);

  return voices;
}

function SpeechSynthesizerNative({ text }: { text?: string }) {
  const voices = useVoices();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (voices.length > 0) {
      const voice = voices.find((v) => v.lang === "en-US");
      if (voice) {
        setVoice(voice);
      } else {
        setVoice(null);
      }
    } else {
      setVoice(null);
    }
  }, [voices]);

  function speak() {
    if (!text || !voice) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    speak();
  }, [text, voice]);

  return <></>;
}

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function SpeechTranscriberNative({ onTranscribed }: { onTranscribed?: (text: string) => void }) {
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
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex justify-center items-center text-center"
          title="Click to start recording"
        >
          <MicrophoneIcon className="h-5 w-5" />
        </button>
      ) : (
        <button
          onClick={() => setEnabled(false)}
          type="button"
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex justify-center items-center text-center"
          title="Click to stop recording"
        >
          <StopIcon className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

function ChatNative() {
  const [messages, setMessages] = useLocalStorage("messages", DEFAULT_MESSAGES);
  const [lastAssistantMessage, setLastAssistantMessage] = useState("");

  function sendMessage(message) {
    if (message === "") return;
    const newChat = [...messages, { role: "user", content: message }];
    setMessages(newChat);
    completeChat(newChat).then((res) => {
      setMessages([...newChat, { role: "assistant", content: res }]);
      setLastAssistantMessage(res);
    });
  }

  function reset() {
    setMessages(DEFAULT_MESSAGES);
  }

  return (
    <>
      <div className="flex flex-col gap-2 grow overflow-auto">
        <div className="flex justify-between">
          <h1>AI Voice Chat</h1>
          <button className="text-blue-400" onClick={reset}>
            Reset
          </button>
        </div>
        <ChatBox messages={messages} />
        <SpeechTranscriberNative
          onTranscribed={(text) => {
            sendMessage(text);
          }}
        />
        <SpeechSynthesizerNative text={lastAssistantMessage} />
      </div>
    </>
  );
}

export function App() {
  return (
    <>
      <div className="flex justify-center bg-gray-200 p-0 sm:p-8 h-full">
        <div className="max-w-prose bg-white p-2 sm:p-8 max-h-full rounded-lg shadow-lg flex flex-col gap-2 sm:gap-8">
          <ChatNative />
        </div>
      </div>
    </>
  );
}
