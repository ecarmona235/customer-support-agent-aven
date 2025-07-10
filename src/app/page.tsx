import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">Customer Agent</h1>
        
        <div className="bg-gray-800 rounded-xl shadow-xl h-[600px] overflow-hidden">
          <ChatWindow />
        </div>
        
        <div className="mt-8 text-center">
          <h2 className="text-xl text-gray-300">Here will go the call option</h2>
        </div>
      </div>
    </div>
  );
}
