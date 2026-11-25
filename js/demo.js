window.BT = window.BT || {};

// The board shown by the Demo button. Written by tools/serve.py from a board made in the tool
// (open http://localhost:8123/capture-demo in the same browser to replace it).
BT.demoBoard = {
  "version": 1,
  "aspiration": {
    "aim": "I want my organization to plan for digital sovereignty.",
    "change": "",
    "challenge": ""
  },
  "items": [
    {
      "id": "i1",
      "kind": "barrier",
      "text": "The C-suite is very reluctant when I try to start conversations on this topic",
      "x": 215.65652993082665,
      "y": -362.73237924112067,
      "type": "People"
    },
    {
      "id": "i3",
      "kind": "opportunity",
      "text": "Digital sovereignty is widely discussed as a national security factor. Our C-suite is aware of this conversation. ",
      "x": 171.22731336018617,
      "y": -648.968004629729,
      "type": "Wider trends"
    },
    {
      "id": "i4",
      "kind": "barrier",
      "text": "We are extremely dependent on Microsoft. Just last week our whole company froze when it was down, costing us millions",
      "x": -438.8757029158388,
      "y": -359.2497806765017,
      "type": "Technology"
    },
    {
      "id": "i2",
      "kind": "influence",
      "text": "Our company is bad at changing the way we work",
      "x": -577.2045891632217,
      "y": -548.2940624021954,
      "type": "Culture"
    },
    {
      "id": "i5",
      "kind": "influence",
      "text": "Especially Jari sets the tone for the conversations, and is extremely dismissive",
      "x": 461.073255471153,
      "y": -276.85863805538503,
      "type": "People",
      "w": 162
    },
    {
      "id": "i8",
      "kind": "opportunity",
      "text": "I have some power over which tools my team uses",
      "x": -281.4897995979476,
      "y": -181.35049780329834,
      "type": "Technology"
    },
    {
      "id": "i10",
      "kind": "influence",
      "text": "The old guard at the company had different values than the new employees. They are now a minority, but still hold a lot of power. Jari is one of them",
      "x": 737.9872282437029,
      "y": -245.79510942635378,
      "type": "Culture",
      "w": 244
    },
    {
      "id": "i9",
      "kind": "influence",
      "text": "CTO holds a lot of power in deciding what technology to use",
      "x": 509.5371305681312,
      "y": -586.9671680439726,
      "type": "Structures"
    },
    {
      "id": "i11",
      "kind": "note",
      "text": "I'm not sure how reluctant the CTO herself is",
      "x": 328.5180834609298,
      "y": -497.30291471333146,
      "w": 140
    },
    {
      "id": "i12",
      "kind": "note",
      "text": "CTO and Jari play padel every week. That might affect things",
      "x": 530.666632194098,
      "y": -432.76334178046034,
      "w": 140
    },
    {
      "id": "i15",
      "kind": "influence",
      "text": "There is no strategy in place for digital sovereignty",
      "x": -104.09621869996403,
      "y": -485.3907805217166,
      "type": "Structures",
      "w": 191
    }
  ],
  "connections": [
    {
      "id": "c1",
      "from": "i3",
      "to": "i1"
    },
    {
      "id": "c3",
      "from": "i2",
      "to": "i4",
      "arrow": "to"
    },
    {
      "id": "c6",
      "from": "i5",
      "to": "i1",
      "arrow": "to"
    },
    {
      "id": "c9",
      "from": "i8",
      "to": "i4"
    },
    {
      "id": "c11",
      "from": "i10",
      "to": "i5",
      "arrow": "to"
    },
    {
      "id": "c10",
      "from": "i9",
      "to": "i1"
    },
    {
      "id": "c2",
      "from": "i5",
      "to": "i9"
    }
  ]
};
