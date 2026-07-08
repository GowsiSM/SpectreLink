// src/App.test.js
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import io from "socket.io-client";

const mockSocket = {
  id: "socket-1",
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("socket.io-client", () => jest.fn(() => mockSocket));

describe("App socket lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // These return mockSocket so chained calls like socket.on().on() work
    mockSocket.on.mockReturnValue(mockSocket);
    mockSocket.off.mockReturnValue(mockSocket);
    mockSocket.emit.mockReturnValue(mockSocket);
  });

  test("creates socket on mount", () => {
    render(<App />);
    // io() should be called as soon as the component mounts
    // not waiting for any button click
    expect(io).toHaveBeenCalledTimes(1);
  });

  test("emits join_room with the latest form values", () => {
    render(<App />);

    // Socket is already created by now (mount triggered useEffect)
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByPlaceholderText(/room id/i), {
      target: { value: "room-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join room/i }));

    // Now just verify emit was called — no need to verify io() again
    expect(mockSocket.emit).toHaveBeenCalledWith("join_room", {
      room: "room-1",
      username: "Ada",
    });
  });

  test("disconnects the socket when the app unmounts", () => {
    const { unmount } = render(<App />);

    // No need to click Join Room — socket exists from mount
    // unmount triggers useEffect cleanup which calls socket.disconnect()
    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  test("does not emit join_room when fields are empty", () => {
    render(<App />);

    // Click Join Room without filling in fields
    fireEvent.click(screen.getByRole("button", { name: /join room/i }));

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});
